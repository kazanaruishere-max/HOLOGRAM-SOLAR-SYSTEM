/**
 * Gesture Controller
 * Handles gesture recognition and translates to 3D scene interactions
 */

class GestureController {
    constructor(camera, solarSystem, scene) {
        this.camera = camera;
        this.solarSystem = solarSystem;
        this.scene = scene;

        // Gesture state
        this.currentGesture = null;
        this.lastGesturePosition = null;
        this.gestureStartTime = 0;

        // Interaction state
        this.isZooming = false;
        this.isRotating = false;
        this.isPanning = false;
        this.isPointing = false;

        // Smoothing parameters - optimized for responsiveness
        this.zoomSmoothing = 0.2;  // Increased for faster response
        this.rotationSmoothing = 0.25;  // Increased for faster response
        this.panSmoothing = 0.2;  // Increased for faster response

        // Target values for smooth interpolation
        this.targetZoom = camera.position.z;
        this.targetRotation = { x: 0, y: 0 };
        this.targetPan = { x: 0, y: 0 };

        // Raycaster for planet selection
        this.raycaster = new THREE.Raycaster();
        this.selectedPlanet = null;

        // Hand detection tracking
        this.handsDetected = false;
        this.lastHandDetectionTime = 0;

        // Gesture thresholds - increased for more responsive control
        this.pinchZoomSpeed = 8;  // Increased from 5
        this.rotationSpeed = 3;  // Increased from 2
        this.panSpeed = 5;  // Increased from 3

        // Paused state (for modal interaction)
        this.isPaused = false;
        
        // Cache DOM references for performance
        this.gestureNameElement = null;
        this.gestureIndicatorElement = null;
    }
    
    /**
     * Initialize DOM references (call after DOM is ready)
     */
    initDOMReferences() {
        this.gestureNameElement = document.getElementById('gesture-name');
        this.gestureIndicatorElement = document.getElementById('gesture-indicator');
    }

    /**
     * Handle incoming gesture data from backend
     */
    handleGesture(gestureData) {
        // If paused (e.g. modal open), ignore all gestures except maybe 'none' to clear state
        if (this.isPaused) {
            return;
        }
        if (!gestureData || !gestureData.type) {
            // No gesture data - reset everything
            this.handleNoGesture();
            this.updateGestureUI('none');
            return;
        }

        const gestureType = gestureData.type;
        const position = gestureData.position;

        // If gesture is 'none', immediately reset and return
        if (gestureType === 'none') {
            this.handleNoGesture();
            this.updateGestureUI('none');
            return;
        }

        // Valid gesture detected
        this.handsDetected = true;
        this.lastHandDetectionTime = Date.now();

        // Debug logging
        if (gestureType !== 'none') {
            console.log('Gesture detected:', gestureType, 'Confidence:', gestureData.confidence);
        }

        // Update gesture indicator UI
        this.updateGestureUI(gestureType);

        // Handle different gesture types
        switch (gestureType) {
            case 'pinch':
                this.handlePinch(gestureData);
                break;
            case 'open_palm':
                this.handleOpenPalm(gestureData);
                break;
            case 'point':
                this.handlePoint(gestureData);
                break;
            case 'two_fingers':
                this.handleTwoFingers(gestureData);
                break;
            default:
                console.log('Unknown gesture type:', gestureType);
                this.handleNoGesture();
        }

        this.currentGesture = gestureType;
        this.lastGesturePosition = position;
    }

    /**
     * Handle pinch gesture (zoom)
     */
    handlePinch(gestureData) {
        this.isZooming = true;
        this.isRotating = false;
        this.isPanning = false;
        this.isPointing = false;

        // Only process if we have valid distance data
        if (gestureData.distance === undefined || gestureData.distance === null) {
            this.handleNoGesture();
            return;
        }

        // Calculate zoom based on pinch distance
        // Smaller distance = zoom in, larger distance = zoom out
        const pinchDistance = gestureData.distance || 0.05;
        const zoomFactor = 1 - (pinchDistance / 0.05); // Normalize to -1 to 1

        // Only process if zoom factor is significant
        if (Math.abs(zoomFactor) < 0.01) {
            return; // No significant zoom change
        }

        // Update target zoom (clamp between 5 and 100)
        this.targetZoom += zoomFactor * this.pinchZoomSpeed;
        this.targetZoom = THREE.MathUtils.clamp(this.targetZoom, 5, 100);

        // Smooth zoom interpolation
        this.camera.position.z = THREE.MathUtils.lerp(
            this.camera.position.z,
            this.targetZoom,
            this.zoomSmoothing
        );
    }

    /**
     * Handle open palm gesture (rotate)
     * Rotates camera around the origin to rotate the view
     */
    handleOpenPalm(gestureData) {
        this.isRotating = true;
        this.isZooming = false;
        this.isPanning = false;
        this.isPointing = false;

        if (this.lastGesturePosition && gestureData.position) {
            // Calculate movement delta
            const deltaX = gestureData.position.x - this.lastGesturePosition.x;
            const deltaY = gestureData.position.y - this.lastGesturePosition.y;

            // Update target rotation (spherical coordinates)
            this.targetRotation.y += deltaX * this.rotationSpeed;
            this.targetRotation.x += deltaY * this.rotationSpeed;

            // Clamp vertical rotation (pitch)
            this.targetRotation.x = THREE.MathUtils.clamp(this.targetRotation.x, -Math.PI / 3, Math.PI / 3);

            // Convert spherical coordinates to cartesian for camera position
            const radius = Math.sqrt(
                this.camera.position.x ** 2 +
                this.camera.position.y ** 2 +
                this.camera.position.z ** 2
            );

            const theta = this.targetRotation.y; // Horizontal angle (yaw)
            const phi = Math.PI / 2 - this.targetRotation.x; // Vertical angle (pitch)

            // Calculate new camera position (looking at origin)
            const newX = radius * Math.sin(phi) * Math.sin(theta);
            const newY = radius * Math.cos(phi);
            const newZ = radius * Math.sin(phi) * Math.cos(theta);

            // Smooth interpolation
            this.camera.position.x = THREE.MathUtils.lerp(
                this.camera.position.x,
                newX,
                this.rotationSmoothing
            );
            this.camera.position.y = THREE.MathUtils.lerp(
                this.camera.position.y,
                newY,
                this.rotationSmoothing
            );
            this.camera.position.z = THREE.MathUtils.lerp(
                this.camera.position.z,
                newZ,
                this.rotationSmoothing
            );

            // Make camera look at origin
            this.camera.lookAt(0, 0, 0);
        }
    }

    /**
     * Handle point gesture (select planet) - IMPROVED with larger hitbox and area selection
     */
    handlePoint(gestureData) {
        this.isPointing = true;
        this.isZooming = false;
        this.isRotating = false;
        this.isPanning = false;

        if (!gestureData.position || !gestureData.direction) {
            return;
        }

        // Convert screen coordinates to normalized device coordinates
        const x = (gestureData.position.x - 0.5) * 2;
        const y = -(gestureData.position.y - 0.5) * 2;

        // Create ray from camera through point
        this.raycaster.setFromCamera(
            new THREE.Vector2(x, y),
            this.camera
        );

        // Get all planets with their hitboxes (invisible larger spheres)
        const allPlanets = this.solarSystem.getPlanets();
        const selectableObjects = [];

        // Collect all hitboxes (invisible larger spheres) from planets
        allPlanets.forEach(planet => {
            // Get the hitbox (check userData to identify hitbox)
            if (planet.children && planet.children.length > 0) {
                planet.children.forEach(child => {
                    // Check if this is a hitbox (invisible sphere with specific size)
                    // Hitbox should be larger than planet and invisible
                    if (child.material && 
                        !child.material.visible && 
                        child.geometry && 
                        child.geometry.parameters && 
                        child.geometry.parameters.radius > (planet.userData.size || 1)) {
                        // This is likely the hitbox
                        selectableObjects.push({
                            object: child,
                            planet: planet,
                            isHitbox: true
                        });
                    }
                });
            }
            // Also add planet itself as fallback
            selectableObjects.push({
                object: planet,
                planet: planet,
                isHitbox: false
            });
        });

        // Check intersection with all selectable objects (hitboxes first)
        const intersects = this.raycaster.intersectObjects(
            selectableObjects.map(item => item.object),
            false  // Don't check children recursively
        );

        let selectedPlanet = null;

        if (intersects.length > 0) {
            // Prioritize hitbox hits over planet hits
            const hitObject = intersects[0].object;
            const hitItem = selectableObjects.find(item => item.object === hitObject);
            if (hitItem) {
                selectedPlanet = hitItem.planet;
            } else {
                // Fallback: find nearest planet
                selectedPlanet = this.findNearestPlanetToRay(this.raycaster.ray, allPlanets);
            }
        } else {
            // If no direct hit, find nearest planet to the ray
            selectedPlanet = this.findNearestPlanetToRay(this.raycaster.ray, allPlanets);
        }

        // Show planet info if different planet selected
        if (selectedPlanet && selectedPlanet !== this.selectedPlanet) {
            this.selectedPlanet = selectedPlanet;
            this.showPlanetInfo(selectedPlanet);
        }
    }

    /**
     * Find nearest planet to a ray (for easier selection)
     */
    findNearestPlanetToRay(ray, planets) {
        let nearestPlanet = null;
        let minDistance = Infinity;
        const maxSelectionDistance = 20; // Maximum distance to consider selection (increased for easier selection)

        planets.forEach(planet => {
            // Get planet position in world space
            const planetPosition = new THREE.Vector3();
            planet.getWorldPosition(planetPosition);

            // Calculate distance from ray to planet center
            const distanceToRay = ray.distanceToPoint(planetPosition);

            // Get hitbox size (3x planet size) or fallback to planet size
            const hitboxSize = planet.userData.hitboxSize || (planet.userData.size * 3) || 3;

            // Check if planet is within selection range (using hitbox size)
            // If ray is within hitbox radius + extra margin, consider it selectable
            if (distanceToRay < hitboxSize + maxSelectionDistance) {
                if (distanceToRay < minDistance) {
                    minDistance = distanceToRay;
                    nearestPlanet = planet;
                }
            }
        });

        return nearestPlanet;
    }

    /**
     * Handle two fingers gesture (pan)
     */
    handleTwoFingers(gestureData) {
        this.isPanning = true;
        this.isZooming = false;
        this.isRotating = false;
        this.isPointing = false;

        // Only process if we have valid position data
        if (!gestureData.position) {
            this.handleNoGesture();
            return;
        }

        if (this.lastGesturePosition && gestureData.position) {
            // Calculate movement delta
            const deltaX = gestureData.position.x - this.lastGesturePosition.x;
            const deltaY = gestureData.position.y - this.lastGesturePosition.y;

            // Only process if movement is significant
            if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) {
                return; // No significant movement
            }

            // Update target pan
            this.targetPan.x += deltaX * this.panSpeed;
            this.targetPan.y += deltaY * this.panSpeed;

            // Apply pan to camera (move camera position)
            const panX = THREE.MathUtils.lerp(
                this.camera.position.x,
                this.targetPan.x,
                this.panSmoothing
            );
            const panY = THREE.MathUtils.lerp(
                this.camera.position.y,
                -this.targetPan.y, // Invert Y for natural movement
                this.panSmoothing
            );

            this.camera.position.x = panX;
            this.camera.position.y = panY;
        } else {
            // No last position - initialize
            this.lastGesturePosition = gestureData.position;
        }
    }

    /**
     * Handle no gesture (reset interaction states completely)
     */
    handleNoGesture() {
        // Immediately reset all states (no gradual reset to avoid traces)
        this.isZooming = false;
        this.isRotating = false;
        this.isPanning = false;
        this.isPointing = false;

        // Reset gesture position to prevent traces
        this.lastGesturePosition = null;

        // Reset current gesture
        this.currentGesture = null;
    }

    /**
     * Update gesture indicator UI
     */
    updateGestureUI(gestureType) {
        // Lazy load DOM references if not cached
        if (!this.gestureNameElement) {
            this.gestureNameElement = document.getElementById('gesture-name');
        }
        if (!this.gestureIndicatorElement) {
            this.gestureIndicatorElement = document.getElementById('gesture-indicator');
        }

        if (this.gestureNameElement && this.gestureIndicatorElement) {
            this.gestureNameElement.textContent = gestureType.replace('_', ' ');

            // Add active class for visual feedback
            this.gestureIndicatorElement.classList.add('active');
            this.gestureIndicatorElement.classList.add('gesture-feedback');

            // Remove feedback class after animation
            setTimeout(() => {
                if (this.gestureIndicatorElement) {
                    this.gestureIndicatorElement.classList.remove('gesture-feedback');
                }
            }, 300);
        }
    }

    /**
     * Show planet information modal
     */
    showPlanetInfo(planet) {
        // If already paused (modal open), don't change content
        if (this.isPaused) return;

        const info = this.solarSystem.getPlanetInfo(planet);
        if (!info) return;

        // Pause gestures while modal is open
        this.isPaused = true;

        // Update modal content
        document.getElementById('planet-name').textContent = info.name;
        document.getElementById('planet-distance').textContent = info.distance;
        document.getElementById('planet-diameter').textContent = info.diameter;
        document.getElementById('planet-period').textContent = info.period;

        // Show modal
        const modal = document.getElementById('planet-modal');
        modal.classList.remove('hidden');

        // Highlight selected planet (optional visual feedback)
        this.highlightPlanet(planet);
    }

    /**
     * Resume gestures (called when modal is closed)
     */
    resume() {
        this.isPaused = false;
        // Reset interaction states to prevent jump
        this.handleNoGesture();
    }

    /**
     * Highlight selected planet
     */
    highlightPlanet(planet) {
        // Remove previous highlight
        this.solarSystem.getPlanets().forEach(p => {
            if (p.userData.highlight) {
                p.material.emissive.setHex(0x000000);
                p.userData.highlight = false;
            }
        });

        // Add highlight to selected planet
        if (planet) {
            planet.material.emissive.setHex(0x444444);
            planet.userData.highlight = true;

            // Remove highlight after 2 seconds
            setTimeout(() => {
                if (planet.userData.highlight) {
                    planet.material.emissive.setHex(0x000000);
                    planet.userData.highlight = false;
                }
            }, 2000);
        }
    }

    /**
     * Check if hands have been detected recently
     */
    hasDetectedHands() {
        const timeSinceLastDetection = Date.now() - this.lastHandDetectionTime;
        return this.handsDetected && timeSinceLastDetection < 2000; // 2 second timeout
    }

    /**
     * Reset gesture controller state
     */
    reset() {
        this.currentGesture = null;
        this.lastGesturePosition = null;
        this.isZooming = false;
        this.isRotating = false;
        this.isPanning = false;
        this.isPointing = false;
        this.targetZoom = 30;
        this.targetRotation = { x: 0, y: 0 };
        this.targetPan = { x: 0, y: 0 };
        this.selectedPlanet = null;
    }
}

