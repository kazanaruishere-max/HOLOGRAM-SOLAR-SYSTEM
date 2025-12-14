/**
 * Camera Overlay Module
 * Handles camera video feed display and hand tracking visualization
 */

class CameraOverlay {
    constructor() {
        // Preview canvas (small window in bottom right)
        this.previewCanvas = document.getElementById('camera-preview-canvas');
        this.previewContext = this.previewCanvas ? this.previewCanvas.getContext('2d', {
            alpha: false,  // No alpha for better performance
            desynchronized: true,  // Allow async rendering
            willReadFrequently: false
        }) : null;
        
        // Hand overlay on preview
        this.overlayCanvas = document.getElementById('hand-preview-overlay');
        this.overlayContext = this.overlayCanvas ? this.overlayCanvas.getContext('2d', {
            alpha: true,
            desynchronized: true
        }) : null;
        
        this.currentFrame = null;
        this.currentLandmarks = null;
        
        // Frame queue for smooth playback (drop old frames)
        this.frameQueue = [];
        this.maxQueueSize = 1;  // Only keep latest frame (drop old ones immediately)
        this.isRendering = false;
        this.lastFrameTime = 0;
        this.targetFPS = 30;  // Target 30 FPS for preview
        
        // Performance tracking
        this.frameDropCount = 0;
        this.lastPerformanceCheck = performance.now();
        
        // Auto-clear overlay if no hands detected for too long
        this.lastLandmarkTime = 0;
        this.clearTimeout = 200; // Clear overlay after 200ms of no hands
        this.startAutoClear();
        
        // Initialize canvas sizes
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());
        
        // Start render loop
        this.startRenderLoop();
        
        console.log('CameraOverlay initialized:', {
            previewCanvas: !!this.previewCanvas,
            overlayCanvas: !!this.overlayCanvas
        });
    }
    
    /**
     * Resize all canvases
     */
    resizeCanvases() {
        if (this.previewCanvas) {
            // Preview is fixed size, but set canvas resolution
            this.previewCanvas.width = 320;
            this.previewCanvas.height = 205; // 240 - 35 (header)
        }
        
        if (this.overlayCanvas) {
            this.overlayCanvas.width = 320;
            this.overlayCanvas.height = 205;
        }
    }
    
    /**
     * Update camera video frame - ULTRA OPTIMIZED with frame queue
     */
    updateFrame(frameData) {
        if (!frameData || !frameData.startsWith('data:image')) {
            return;
        }
        if (!this.previewContext) {
            return;
        }
        
        // Drop old frames immediately if queue is full (keep only latest)
        while (this.frameQueue.length >= this.maxQueueSize) {
            const oldFrame = this.frameQueue.shift();
            if (oldFrame && oldFrame.bitmap && oldFrame.bitmap.close) {
                oldFrame.bitmap.close(); // Clean up ImageBitmap immediately
            }
            this.frameDropCount++;
        }
        
        // Decode frame asynchronously (non-blocking, with timeout)
        const decodePromise = this.decodeFrameAsync(frameData);
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Decode timeout')), 50)
        );
        
        Promise.race([decodePromise, timeoutPromise])
            .then(bitmap => {
                if (bitmap) {
                    this.frameQueue.push({
                        bitmap: bitmap,
                        timestamp: performance.now()
                    });
                }
            })
            .catch(() => {
                // Silent fail - frame will be skipped (better than blocking)
            });
    }
    
    /**
     * Decode frame asynchronously using ImageBitmap API
     */
    async decodeFrameAsync(frameData) {
        try {
            if (typeof createImageBitmap !== 'undefined') {
                // Use fetch with AbortController for timeout
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 100); // 100ms timeout
                
                const response = await fetch(frameData, { signal: controller.signal });
                clearTimeout(timeout);
                
                const blob = await response.blob();
                const bitmap = await createImageBitmap(blob);
                return bitmap;
            } else {
                // Fallback: use Image (slower but compatible)
                return new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = frameData;
                });
            }
        } catch (error) {
            return null; // Return null on error
        }
    }
    
    /**
     * Start render loop for smooth frame display - ULTRA OPTIMIZED
     */
    startRenderLoop() {
        const targetFrameTime = 1000 / this.targetFPS;
        let nextFrameTime = performance.now();
        
        const render = () => {
            requestAnimationFrame(render);
            
            const now = performance.now();
            
            // Only render if enough time has passed (throttle to target FPS)
            if (now >= nextFrameTime && this.frameQueue.length > 0) {
                // Get latest frame (drop all older frames)
                let frameToRender = null;
                while (this.frameQueue.length > 0) {
                    const frame = this.frameQueue.shift();
                    // Clean up old frames immediately
                    if (frame.bitmap && frame.bitmap.close) {
                        frame.bitmap.close();
                    }
                    // Keep only the last frame
                    frameToRender = frame;
                }
                
                if (frameToRender && frameToRender.bitmap) {
                    this.drawFrameToPreview(frameToRender.bitmap);
                    nextFrameTime = now + targetFrameTime;
                }
            }
        };
        
        render();
    }
    
    /**
     * Draw frame to preview canvas - OPTIMIZED
     */
    drawFrameToPreview(img) {
        if (!this.previewContext || !this.previewCanvas || !img) return;
        
        // Use imageSmoothingEnabled for better performance
        this.previewContext.imageSmoothingEnabled = true;
        this.previewContext.imageSmoothingQuality = 'low';  // Faster rendering
        
        // Direct draw without clearing (faster)
        // Only clear if needed (when size changes)
        const imgAspect = img.width / img.height;
        const canvasAspect = this.previewCanvas.width / this.previewCanvas.height;
        
        let drawWidth, drawHeight, drawX, drawY;
        
        if (imgAspect > canvasAspect) {
            drawHeight = this.previewCanvas.height;
            drawWidth = drawHeight * imgAspect;
            drawX = (this.previewCanvas.width - drawWidth) / 2;
            drawY = 0;
        } else {
            drawWidth = this.previewCanvas.width;
            drawHeight = drawWidth / imgAspect;
            drawX = 0;
            drawY = (this.previewCanvas.height - drawHeight) / 2;
        }
        
        // Clear only the area we'll draw to (faster than full clear)
        this.previewContext.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        
        // Draw image directly
        this.previewContext.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }
    
    /**
     * Update hand landmarks and draw skeleton - OPTIMIZED
     * Clears overlay when no hands detected
     */
    updateHandLandmarks(landmarks) {
        // Clear overlay immediately if no landmarks
        if (!landmarks || landmarks.length === 0) {
            this.currentLandmarks = null;
            this.lastLandmarkTime = performance.now();
            this.clearOverlay();
            return;
        }
        
        // Update timestamp when landmarks are detected
        this.lastLandmarkTime = performance.now();
        this.currentLandmarks = landmarks;
        
        // Use requestAnimationFrame for smooth rendering
        if (!this.skeletonRendering) {
            this.skeletonRendering = true;
            requestAnimationFrame(() => {
                this.drawHandSkeleton();
                this.skeletonRendering = false;
            });
        }
    }
    
    /**
     * Clear overlay canvas completely
     */
    clearOverlay() {
        if (this.overlayContext && this.overlayCanvas) {
            this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
        this.currentLandmarks = null; // Reset landmarks
    }
    
    /**
     * Start auto-clear timer to remove traces when no hands detected
     */
    startAutoClear() {
        const checkClear = () => {
            requestAnimationFrame(checkClear);
            
            const now = performance.now();
            // If no landmarks for too long, clear overlay
            if (this.currentLandmarks === null && 
                this.overlayContext && 
                now - this.lastLandmarkTime > this.clearTimeout) {
                this.clearOverlay();
            }
        };
        checkClear();
    }
    
    /**
     * Draw hand skeleton on overlay canvas - OPTIMIZED
     */
    drawHandSkeleton() {
        if (!this.overlayContext) {
            return;
        }
        
        // Always clear previous frame first (removes any traces)
        this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        
        // If no landmarks, don't draw anything
        if (!this.currentLandmarks || this.currentLandmarks.length === 0) {
            return;
        }
        
        // Batch draw operations
        this.overlayContext.save();
        
        // Draw each hand
        this.currentLandmarks.forEach((hand, handIndex) => {
            this.drawHand(hand, handIndex);
        });
        
        this.overlayContext.restore();
    }
    
    /**
     * Draw a single hand skeleton - OPTIMIZED
     */
    drawHand(hand, handIndex) {
        const ctx = this.overlayContext;
        const landmarks = hand.landmarks;
        
        if (!landmarks || landmarks.length < 21) return;
        
        // Pre-calculate screen coordinates (faster)
        const screenCoords = new Array(21);
        for (let i = 0; i < 21; i++) {
            screenCoords[i] = {
                x: landmarks[i].x * this.overlayCanvas.width,
                y: landmarks[i].y * this.overlayCanvas.height
            };
        }
        
        // Hand connections (MediaPipe hand structure)
        const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],  // Thumb
            [0, 5], [5, 6], [6, 7], [7, 8],  // Index
            [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
            [0, 13], [13, 14], [14, 15], [15, 16],  // Ring
            [0, 17], [17, 18], [18, 19], [19, 20],  // Pinky
            [5, 9], [9, 13], [13, 17], [17, 5]  // Palm
        ];
        
        // Batch draw connections
        ctx.strokeStyle = handIndex === 0 ? 'rgba(0, 255, 136, 0.8)' : 'rgba(0, 150, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        
        connections.forEach(([start, end]) => {
            ctx.moveTo(screenCoords[start].x, screenCoords[start].y);
            ctx.lineTo(screenCoords[end].x, screenCoords[end].y);
        });
        ctx.stroke();
        
        // Batch draw landmarks (only important ones for performance)
        const importantLandmarks = [0, 4, 8, 12, 16, 20]; // Wrist and fingertips
        importantLandmarks.forEach(index => {
            const coord = screenCoords[index];
            let color = 'rgba(255, 255, 0, 0.9)';
            if (index === 0) color = 'rgba(255, 100, 100, 0.9)';
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(coord.x, coord.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        
        // Draw hand label (optional, can be removed for more performance)
        if (hand.label && screenCoords[0]) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.font = '10px Arial';
            ctx.fillText(hand.label, screenCoords[0].x + 10, screenCoords[0].y - 10);
        }
    }
    
    /**
     * Clear overlay
     */
    clear() {
        if (this.overlayContext) {
            this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        }
    }
    
    /**
     * Show preview window
     */
    show() {
        const preview = document.getElementById('camera-preview');
        if (preview) {
            preview.style.display = 'flex';
        }
    }
    
    /**
     * Hide preview window
     */
    hide() {
        const preview = document.getElementById('camera-preview');
        if (preview) {
            preview.style.display = 'none';
        }
    }
}

