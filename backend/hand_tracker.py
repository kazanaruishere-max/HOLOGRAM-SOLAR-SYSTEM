"""
MediaPipe Hand Tracking Module
Detects and tracks hand landmarks in real-time
"""

import cv2
import mediapipe as mp
import numpy as np


class HandTracker:
    """Hand tracking using MediaPipe Hands"""
    
    def __init__(self, model_complexity=0):
        """
        Initialize MediaPipe Hands model
        
        Args:
            model_complexity: 0=Lite (Fastest), 1=Full (Default)
        """
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,  # Reduced to 1 hand for maximum speed
            min_detection_confidence=0.5,  # Lower threshold for faster detection
            min_tracking_confidence=0.5,
            model_complexity=model_complexity  # Use Lite model by default
        )
        self.mp_drawing = mp.solutions.drawing_utils
        
        # Smoothing filter (moving average) - reduced for lower latency
        self.landmark_history = []
        self.history_size = 6  # Increased for 60 FPS (100ms window) for smoother cursor
    
    def process(self, frame):
        """
        Process frame and detect hands
        
        Args:
            frame: BGR image frame from OpenCV
            
        Returns:
            MediaPipe results object
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process with MediaPipe
        results = self.hands.process(rgb_frame)
        
        return results
    
    def get_landmarks(self, results):
        """
        Extract and smooth hand landmarks
        
        Args:
            results: MediaPipe results object
            
        Returns:
            List of hand landmark dictionaries with smoothed coordinates
        """
        if not results.multi_hand_landmarks:
            return None
        
        hands_data = []
        
        for hand_landmarks, handedness in zip(
            results.multi_hand_landmarks,
            results.multi_handedness
        ):
            # Extract landmarks
            landmarks = []
            for landmark in hand_landmarks.landmark:
                landmarks.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z
                })
            
            # Apply smoothing filter
            smoothed_landmarks = self._smooth_landmarks(landmarks)
            
            # Get hand label (Left/Right)
            hand_label = handedness.classification[0].label
            
            hands_data.append({
                'landmarks': smoothed_landmarks,
                'label': hand_label,
                'wrist': smoothed_landmarks[0],  # Wrist is landmark 0
                'index_tip': smoothed_landmarks[8],  # Index finger tip
                'thumb_tip': smoothed_landmarks[4],  # Thumb tip
                'middle_tip': smoothed_landmarks[12],  # Middle finger tip
            })
        
        return hands_data
    
    def _smooth_landmarks(self, landmarks):
        """
        Apply moving average filter to reduce jitter
        
        Args:
            landmarks: Current frame landmarks
            
        Returns:
            Smoothed landmarks
        """
        # Add current landmarks to history
        self.landmark_history.append(landmarks)
        
        # Keep only recent history
        if len(self.landmark_history) > self.history_size:
            self.landmark_history.pop(0)
        
        # If not enough history, return current landmarks
        if len(self.landmark_history) < 2:
            return landmarks
        
        # Calculate moving average
        smoothed = []
        for i in range(len(landmarks)):
            avg_x = sum(h[i]['x'] for h in self.landmark_history) / len(self.landmark_history)
            avg_y = sum(h[i]['y'] for h in self.landmark_history) / len(self.landmark_history)
            avg_z = sum(h[i]['z'] for h in self.landmark_history) / len(self.landmark_history)
            
            smoothed.append({
                'x': avg_x,
                'y': avg_y,
                'z': avg_z
            })
        
        return smoothed
    
    def draw_landmarks(self, frame, results):
        """
        Draw hand landmarks and connections on frame
        
        Args:
            frame: BGR image frame
            results: MediaPipe results object
            
        Returns:
            Frame with drawn landmarks
        """
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                # Draw landmarks
                self.mp_drawing.draw_landmarks(
                    frame,
                    hand_landmarks,
                    self.mp_hands.HAND_CONNECTIONS,
                    self.mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                    self.mp_drawing.DrawingSpec(color=(0, 0, 255), thickness=2)
                )
        
        return frame
    
    def cleanup(self):
        """Release resources"""
        if self.hands:
            self.hands.close()

