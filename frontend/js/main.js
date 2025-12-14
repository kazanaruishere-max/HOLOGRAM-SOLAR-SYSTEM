/**
 * Main Application Entry Point
 * Initializes Three.js scene, WebSocket connection, and coordinates all modules
 */

// Global state
const AppState = {
    socket: null,
    scene: null,
    camera: null,
    renderer: null,
    solarSystem: null,
    arOverlay: null, // New AR Overlay
    isPaused: false,
    scaleMode: false,
    currentFPS: 0,
    currentLatency: 0,
    isInitialized: false,
    targetFPS: 60  // Default target FPS
};

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the entire application
 */
async function initializeApp() {
    try {
        // Show loading screen
        showLoadingScreen();

        // Initialize WebSocket connection
        await initializeWebSocket();

        // Initialize Three.js scene
        initializeThreeJS();

        // Initialize solar system
        AppState.solarSystem = new SolarSystem(AppState.scene);
        AppState.solarSystem.create();

        // Initialize AR Overlay (New) with error handling
        try {
            if (typeof AROverlay !== 'undefined') {
                AppState.arOverlay = new AROverlay();
                if (AppState.arOverlay && AppState.arOverlay.init) {
                    AppState.arOverlay.init(AppState.solarSystem);
                }
            } else {
                console.warn('AROverlay class not found, continuing without AR overlay');
                AppState.arOverlay = null;
            }
        } catch (error) {
            console.error('Failed to initialize AR Overlay:', error);
            AppState.arOverlay = null;
        }

        // Initialize gesture controller
        AppState.gestureController = new GestureController(
            AppState.camera,
            AppState.solarSystem,
            AppState.scene
        );

        // Initialize camera overlay
        AppState.cameraOverlay = new CameraOverlay();
        AppState.cameraOverlay.show(); // Show preview window

        // Setup UI event listeners
        setupUIListeners();

        // Setup AR Interaction Listeners (New)
        setupARListeners();

        // Start render loop
        startRenderLoop();

        // Log initialization
        console.log('Application initialized successfully');
        console.log('Camera overlay:', AppState.cameraOverlay);
        console.log('Gesture controller:', AppState.gestureController);
        console.log('AR Overlay:', AppState.arOverlay);

        // Hide loading screen after a short delay
        setTimeout(() => {
            hideLoadingScreen();
            showApp();
        }, 1500);

        AppState.isInitialized = true;

    } catch (error) {
        console.error('Initialization error:', error);
        showError('Failed to initialize application: ' + error.message);
    }
}

/**
 * Setup AR Event Listeners
 */
function setupARListeners() {
    // Listen for planet SELECTION (after 2s hold)
    window.addEventListener('planet-selected', (e) => {
        const planet = e.detail.planet;
        if (AppState.gestureController) {
            AppState.gestureController.showPlanetInfo(planet);
        }
    });

    // Listen for hover (for visual feedback mostly)
    window.addEventListener('planet-hover', (e) => {
        // Optional: Play a sound or small effect?
        // Currently handled by CSS (.active class)
    });

    // Listen for hover end
    window.addEventListener('planet-hover-end', () => {
        // Optional: Hide info? Or keep it until new selection? 
        // Typically keep it until changed or timed out.
    });
}

/**
 * Initialize WebSocket connection to backend
 */
function initializeWebSocket() {
    return new Promise((resolve, reject) => {
        try {
            // Connect to Flask-SocketIO server - OPTIMIZED
            AppState.socket = io('http://localhost:5000', {
                transports: ['websocket'],  // WebSocket only for better performance
                reconnection: true,
                reconnectionDelay: 500,  // Faster reconnection
                reconnectionDelayMax: 3000,
                reconnectionAttempts: Infinity,
                timeout: 5000,
                forceNew: false,  // Reuse connection
                upgrade: false,  // Don't upgrade from polling
                rememberUpgrade: false
            });

            // Connection successful
            AppState.socket.on('connect', () => {
                console.log('Connected to server');
                AppState.socket.emit('start_stream');
                resolve();
            });

            // Stream started
            AppState.socket.on('stream_started', (data) => {
                console.log('Stream started:', data);
            });

            // Receive camera frames and gesture data - ULTRA OPTIMIZED
            AppState.socket.on('camera_frame', (data) => {
                // Update camera preview (async, non-blocking)
                if (AppState.cameraOverlay && data.frame) {
                    // Don't throttle - let the overlay's internal queue handle it
                    AppState.cameraOverlay.updateFrame(data.frame);
                }

                // Update hand landmarks (will clear overlay if no landmarks)
                if (AppState.cameraOverlay) {
                    if (data.landmarks && data.landmarks.length > 0) {
                        AppState.cameraOverlay.updateHandLandmarks(data.landmarks);
                    } else {
                        // No landmarks - clear overlay immediately
                        AppState.cameraOverlay.updateHandLandmarks(null);
                    }
                }

                // Handle gesture (always process, even 'none' to reset state)
                if (AppState.gestureController) {
                    // Check if gesture controller is paused before processing
                    if (!AppState.gestureController.isPaused && data.gesture) {
                        // Always handle gesture, including 'none' to reset traces
                        AppState.gestureController.handleGesture(data.gesture);

                        // NEW: Update AR Cursor if hands are detected
                        if (AppState.arOverlay && AppState.arOverlay.updateCursor) {
                            // If we have a position, update cursor
                            // Use index_tip if available, otherwise gesture center
                            if (data.gesture.position) {
                                AppState.arOverlay.updateCursor(data.gesture.position);
                            } else if (data.landmarks && data.landmarks.length > 0) {
                                // Fallback to index tip if no gesture position
                                // Check structure: landmarks[0] should have index_tip property
                                const hand = data.landmarks[0];
                                if (hand && hand.index_tip) {
                                    const indexTip = hand.index_tip;
                                    // Landmarks are x,y,z normalized (0-1)
                                    AppState.arOverlay.updateCursor({ x: indexTip.x, y: indexTip.y });
                                } else if (hand && hand.landmarks && hand.landmarks.length > 8) {
                                    // Alternative: use landmark index 8 (index tip)
                                    const indexTip = hand.landmarks[8];
                                    AppState.arOverlay.updateCursor({ x: indexTip.x, y: indexTip.y });
                                }
                            } else {
                                AppState.arOverlay.updateCursor(null);
                            }
                        }
                    } else {
                        // No gesture data - reset everything
                        AppState.gestureController.handleNoGesture();
                        AppState.gestureController.updateGestureUI('none');

                        // Hide cursor
                        if (AppState.arOverlay) {
                            AppState.arOverlay.updateCursor(null);
                        }
                    }
                }

                // Update hand detection status
                if (AppState.gestureController) {
                    if (data.landmarks && data.landmarks.length > 0) {
                        AppState.gestureController.handsDetected = true;
                        AppState.gestureController.lastHandDetectionTime = Date.now();
                    } else {
                        // No hands detected - mark as not detected
                        AppState.gestureController.handsDetected = false;
                    }
                }
            });

            // Performance metrics
            AppState.socket.on('performance', (data) => {
                AppState.currentFPS = data.fps;
                AppState.currentLatency = data.latency;
                updatePerformanceUI(data.fps, data.latency);
            });

            // Error handling
            AppState.socket.on('error', (data) => {
                console.error('Server error:', data.message);
                showError(data.message);
            });

            // Connection error
            AppState.socket.on('connect_error', (error) => {
                console.error('Connection error:', error);
                reject(error);
            });

            // Disconnection
            AppState.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                showError('Connection lost. Attempting to reconnect...');
                
                // Reset all states on disconnect
                if (AppState.gestureController) {
                    AppState.gestureController.handleNoGesture();
                    AppState.gestureController.handsDetected = false;
                }
                if (AppState.cameraOverlay) {
                    AppState.cameraOverlay.updateHandLandmarks(null);
                }
                if (AppState.arOverlay) {
                    AppState.arOverlay.updateCursor(null);
                }
            });

        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Initialize Three.js scene, camera, and renderer
 */
function initializeThreeJS() {
    const canvas = document.getElementById('three-canvas');
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create scene
    AppState.scene = new THREE.Scene();
    AppState.scene.background = new THREE.Color(0x000000);

    // Create camera (FOV: 75 degrees as specified)
    AppState.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    AppState.camera.position.set(0, 0, 30);

    // Create renderer - OPTIMIZED for performance
    AppState.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,  // Disable for better FPS
        powerPreference: 'high-performance',
        stencil: false,  // Disable unused features
        depth: true
    });
    AppState.renderer.setSize(width, height);
    AppState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.0));  // Further reduced for FPS
    AppState.renderer.shadowMap.enabled = false;  // Disable shadows for FPS
    AppState.renderer.shadowMap.type = THREE.BasicShadowMap;
    // Enable frustum culling and other optimizations
    AppState.renderer.sortObjects = false;  // Disable sorting for performance
    AppState.renderer.logarithmicDepthBuffer = false;  // Disable for FPS
    AppState.renderer.precision = 'lowp';  // Lower precision for better FPS

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    AppState.scene.add(ambientLight);

    // Add directional light (sun light) - OPTIMIZED
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 0, 0);
    directionalLight.castShadow = false;  // Disabled for FPS
    AppState.scene.add(directionalLight);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Add OrbitControls as fallback
    try {
        if (typeof THREE !== 'undefined' && THREE.OrbitControls) {
            AppState.orbitControls = new THREE.OrbitControls(AppState.camera, canvas);
            AppState.orbitControls.enableDamping = true;
            AppState.orbitControls.dampingFactor = 0.05;
            AppState.orbitControls.minDistance = 5;
            AppState.orbitControls.maxDistance = 100;
        } else {
            // Create minimal fallback
            AppState.orbitControls = {
                enableDamping: true,
                dampingFactor: 0.05,
                minDistance: 5,
                maxDistance: 100,
                update: function () { },
                reset: function () {
                    AppState.camera.position.set(0, 0, 30);
                }
            };
        }
    } catch (e) {
        console.warn('OrbitControls not available, using fallback');
        AppState.orbitControls = {
            enableDamping: true,
            dampingFactor: 0.05,
            minDistance: 5,
            maxDistance: 100,
            update: function () { },
            reset: function () {
                AppState.camera.position.set(0, 0, 30);
            }
        };
    }
}

/**
 * Handle window resize
 */
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    AppState.camera.aspect = width / height;
    AppState.camera.updateProjectionMatrix();
    AppState.renderer.setSize(width, height);
}

/**
 * Start render loop with requestAnimationFrame - OPTIMIZED for 60-120 FPS
 */
function startRenderLoop() {
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsLastTime = performance.now();

    // Target FPS (dynamic from AppState)
    let targetFPS = AppState.targetFPS || 60;
    let targetFrameTime = 1000 / targetFPS;

    function animate(currentTime) {
        requestAnimationFrame(animate);

        // Update target FPS if changed
        if (AppState.targetFPS !== targetFPS) {
            targetFPS = AppState.targetFPS;
            targetFrameTime = 1000 / targetFPS;
        }

        const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1); // Cap deltaTime
        lastTime = currentTime;

        // Calculate elapsed time for FPS calculation
        let elapsed = currentTime - fpsLastTime;
        
        // Skip frame if too fast (throttle to target FPS) - only for 120 FPS
        if (targetFPS >= 120) {
            if (elapsed < targetFrameTime) {
                return; // Skip this frame
            }
            fpsLastTime = currentTime - (elapsed % targetFrameTime);
        } else {
            fpsLastTime = currentTime;
            // Recalculate elapsed for FPS counter
            elapsed = currentTime - (fpsLastTime - targetFrameTime);
        }

        // Update solar system
        if (!AppState.isPaused && AppState.solarSystem) {
            AppState.solarSystem.update(deltaTime);
        }

        // Update AR Overlay (Keep dots on planets)
        if (AppState.arOverlay && AppState.camera) {
            AppState.arOverlay.update(AppState.camera);
        }

        // Update orbit controls (only if needed)
        if (AppState.orbitControls && AppState.orbitControls.enableDamping) {
            AppState.orbitControls.update();
        }

        // Render scene
        AppState.renderer.render(AppState.scene, AppState.camera);

        // FPS counter (every 60 frames)
        frameCount++;
        if (frameCount % 60 === 0) {
            const actualFPS = Math.round(1000 / (elapsed || 16.67));
            // console.log('Rendering FPS:', actualFPS);
        }
    }

    animate(performance.now());
}

/**
 * Setup UI event listeners
 */
function setupUIListeners() {
    // Pause/Play button
    const pauseBtn = document.getElementById('pause-btn');
    pauseBtn.addEventListener('click', () => {
        AppState.isPaused = !AppState.isPaused;
        pauseBtn.textContent = AppState.isPaused ? '▶ Play' : '⏸ Pause';
    });

    // Reset button
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.addEventListener('click', () => {
        if (AppState.solarSystem) {
            AppState.solarSystem.reset();
        }
        if (AppState.camera) {
            AppState.camera.position.set(0, 0, 30);
        }
        if (AppState.orbitControls) {
            AppState.orbitControls.reset();
        }
    });

    // Scale mode button
    const scaleModeBtn = document.getElementById('scale-mode-btn');
    scaleModeBtn.addEventListener('click', () => {
        AppState.scaleMode = !AppState.scaleMode;
        if (AppState.solarSystem) {
            AppState.solarSystem.setScaleMode(AppState.scaleMode);
        }
        scaleModeBtn.textContent = AppState.scaleMode ? '👁️ View Mode' : '📏 Scale Mode';
    });

    // FPS selector
    const fpsSelect = document.getElementById('fps-select');
    if (fpsSelect) {
        fpsSelect.addEventListener('change', (e) => {
            AppState.targetFPS = parseInt(e.target.value);
            console.log('Target FPS changed to:', AppState.targetFPS);
            // Restart render loop with new FPS
            // The render loop will automatically adjust
        });
    }

    // Close modal
    const closeModal = document.querySelector('.close-modal');
    const planetModal = document.getElementById('planet-modal');
    closeModal.addEventListener('click', () => {
        planetModal.classList.add('hidden');
        // Resume gestures
        if (AppState.gestureController) {
            AppState.gestureController.resume();
        }
    });

    // Close tutorial
    const closeTutorial = document.getElementById('close-tutorial');
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    closeTutorial.addEventListener('click', () => {
        tutorialOverlay.classList.add('hidden');
    });

    // Retry button
    const retryBtn = document.getElementById('retry-btn');
    retryBtn.addEventListener('click', () => {
        location.reload();
    });

    // Show tutorial if no hands detected after 5 seconds
    setTimeout(() => {
        if (!AppState.gestureController || !AppState.gestureController.hasDetectedHands()) {
            showTutorial();
        }
    }, 5000);
}

/**
 * Update performance UI
 */
function updatePerformanceUI(fps, latency) {
    document.getElementById('fps-counter').textContent = fps;
    document.getElementById('latency-counter').textContent = latency;
}

/**
 * Show loading screen
 */
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.remove('hidden');
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('hidden');
}

/**
 * Show main app
 */
function showApp() {
    const appContainer = document.getElementById('app-container');
    appContainer.classList.remove('hidden');
}

/**
 * Show error message
 */
function showError(message) {
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

/**
 * Show tutorial overlay
 */
function showTutorial() {
    const tutorialOverlay = document.getElementById('tutorial-overlay');
    tutorialOverlay.classList.remove('hidden');
}

