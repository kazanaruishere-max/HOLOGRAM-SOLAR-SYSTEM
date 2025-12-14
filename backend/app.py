"""
Flask-SocketIO server for AR Solar System Hologram
Handles WebSocket communication, camera streaming, and gesture data transmission
"""

from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import cv2
import base64
import threading
import time
from hand_tracker import HandTracker
from gesture_recognizer import GestureRecognizer

# Configure Flask to serve frontend files
# Get the parent directory (project root)
import os
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_path = os.path.join(project_root, 'frontend')

app = Flask(__name__, 
            static_folder=frontend_path,
            static_url_path='',
            template_folder=frontend_path)
app.config['SECRET_KEY'] = 'solar-system-ar-secret-key'
# Optimize SocketIO for performance
socketio = SocketIO(
    app, 
    cors_allowed_origins="*", 
    async_mode='threading',
    ping_timeout=10,
    ping_interval=5,
    max_http_buffer_size=1e8,  # 100MB buffer for large frames
    allow_upgrades=True,
    transports=['websocket', 'polling']  # Allow both but prefer websocket
)

# Global variables
hand_tracker = None
gesture_recognizer = None
camera = None
is_streaming = False
stream_thread = None

# Performance monitoring
fps_counter = 0
last_fps_time = time.time()
frame_times = []


def init_camera():
    """Initialize camera with optimized settings for high FPS"""
    global camera
    try:
        camera = cv2.VideoCapture(0)
        # Set higher FPS capability
        camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        camera.set(cv2.CAP_PROP_FPS, 60)  # Request 60 FPS from camera
        # Optimize camera buffer (reduce latency)
        camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimal buffer for low latency
        if not camera.isOpened():
            raise Exception("Camera not available")
        return True
    except Exception as e:
        print(f"Camera initialization error: {e}")
        return False


def init_hand_tracking():
    """Initialize MediaPipe hand tracking"""
    global hand_tracker, gesture_recognizer
    try:
        # Use Lite model (0) for generic laptop CPU
        hand_tracker = HandTracker(model_complexity=0)
        gesture_recognizer = GestureRecognizer()
        print("Hand tracking initialized with Lite model")
        return True
    except Exception as e:
        print(f"Hand tracking initialization error: {e}")
        return False


def stream_camera():
    """Stream camera feed and hand tracking data via WebSocket - OPTIMIZED FOR 60 FPS"""
    global is_streaming, fps_counter, last_fps_time, frame_times
    
    if not camera or not camera.isOpened():
        socketio.emit('error', {'message': 'Camera not available'})
        return
    
    # Target 60 FPS
    target_fps = 60
    frame_time = 1.0 / target_fps
    
    # AI Processing Resolution (Low Res for Efficiency)
    # Using 16:9 aspect ratio to match camera (1280x720) -> 320x180
    ai_width = 320
    ai_height = 180
    
    # Preview Settings
    preview_frame_skip = 2  # Send preview every 2nd frame (30 FPS video, 60 FPS tracking)
    frame_counter = 0
    preview_width = 480
    preview_height = 270
    
    print(f"Starting optimized stream: Camera=1280x720, AI={ai_width}x{ai_height}, Target FPS={target_fps}")
    
    while is_streaming:
        start_time = time.time()
        
        # 1. Capture Frame (High Res)
        ret, frame = camera.read()
        if not ret:
            continue
        
        # Flip immediately (mirror effect)
        frame = cv2.flip(frame, 1)
        
        # 2. Prepare AI Frame (Resize is fast)
        # Resize to small resolution for MediaPipe (this is the key optimization)
        ai_frame = cv2.resize(frame, (ai_width, ai_height), interpolation=cv2.INTER_NEAREST)
        
        # 3. Process Hand Tracking (on Small Frame)
        # MediaPipe is 10x faster on 320x180 than 1280x720
        results = hand_tracker.process(ai_frame)
        landmarks = hand_tracker.get_landmarks(results)
        
        # 4. Recognize Gestures
        gesture_data = None
        if landmarks and len(landmarks) > 0:
            gesture_data = gesture_recognizer.recognize(landmarks)
        
        # 5. Send Preview Frame (Throttled)
        frame_base64 = None
        if frame_counter % preview_frame_skip == 0:
            # Resize for visual preview
            preview_frame = cv2.resize(frame, (preview_width, preview_height), interpolation=cv2.INTER_LINEAR)
            
            # Smart Compression
            # Increase quality slightly since we have more CPU headroom now
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, 70]
            _, buffer = cv2.imencode('.jpg', preview_frame, encode_params)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # 6. Compose & Emit Data
        data = {
            'landmarks': landmarks,
            'gesture': gesture_data,
            'timestamp': time.time(),
        }
        
        if frame_base64:
            data['frame'] = f'data:image/jpeg;base64,{frame_base64}'
            
        socketio.emit('camera_frame', data, namespace='/')
        
        frame_counter += 1
        
        # 7. FPS Calculation & Governance
        elapsed = time.time() - start_time
        frame_times.append(elapsed)
        if len(frame_times) > 60:
            frame_times.pop(0)
            
        fps_counter += 1
        current_time = time.time()
        if current_time - last_fps_time >= 1.0:
            avg_fps = fps_counter / (current_time - last_fps_time)
            avg_latency = sum(frame_times) / len(frame_times) * 1000 if frame_times else 0
            
            socketio.emit('performance', {
                'fps': round(avg_fps, 1),
                'latency': round(avg_latency, 1)
            })
            fps_counter = 0
            last_fps_time = current_time
            
        # Precise Sleep to prevent CPU spinning if we are too fast
        sleep_time = max(0, frame_time - elapsed)
        if sleep_time > 0:
            # time.sleep is not precise enough for high FPS, but `socketio.sleep` yields to other threads
            socketio.sleep(sleep_time)
        else:
            socketio.sleep(0) # Yield


@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print('Client connected')
    emit('connected', {'status': 'ok'})


@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print('Client disconnected')


@socketio.on('start_stream')
def handle_start_stream():
    """Start camera streaming"""
    global is_streaming, stream_thread
    
    if not camera or not camera.isOpened():
        if not init_camera():
            emit('error', {'message': 'Failed to initialize camera'})
            return
    
    if not hand_tracker:
        if not init_hand_tracking():
            emit('error', {'message': 'Failed to initialize hand tracking'})
            return
    
    if not is_streaming:
        is_streaming = True
        stream_thread = threading.Thread(target=stream_camera, daemon=True)
        stream_thread.start()
        emit('stream_started', {'status': 'ok'})


@socketio.on('stop_stream')
def handle_stop_stream():
    """Stop camera streaming"""
    global is_streaming
    is_streaming = False
    emit('stream_stopped', {'status': 'ok'})


@app.route('/')
def index():
    """Serve main HTML page"""
    return render_template('index.html')


if __name__ == '__main__':
    # Initialize camera and hand tracking
    print("Initializing camera...")
    if init_camera():
        print("Camera initialized successfully")
    else:
        print("Warning: Camera initialization failed")
    
    print("Initializing hand tracking...")
    if init_hand_tracking():
        print("Hand tracking initialized successfully")
    else:
        print("Warning: Hand tracking initialization failed")
    
    # Run server
    print("Starting server on http://localhost:5000")
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)

