/**
 * AR Overlay System
 * Manages 2D interactive elements that overlay the 3D scene (Dots, Labels, Cursor)
 */
class AROverlay {
    constructor() {
        this.container = document.getElementById('ar-overlay');
        this.cursor = document.getElementById('hand-cursor');
        this.dots = new Map(); // Map<Mesh, HTMLElement>
        this.activePlanet = null;
    }

    /**
     * Initialize dots for all planets
     */
    init(solarSystem) {
        if (!solarSystem) return;

        const planets = solarSystem.getPlanets();
        planets.forEach(planet => {
            this.createDot(planet);
        });

        console.log(`AR Overlay initialized with ${this.dots.size} planets`);
    }

    /**
     * Create a single DOM dot for a planet
     */
    createDot(planet) {
        // Validate planet data
        if (!planet || !planet.userData) {
            console.warn('Invalid planet data for dot creation');
            return;
        }
        
        const data = planet.userData.originalData;
        if (!data) {
            console.warn('Planet missing originalData:', planet.userData.name);
            return;
        }

        const dot = document.createElement('div');
        dot.className = 'ar-dot';
        
        // Format color properly (handle hex conversion)
        const colorHex = typeof data.color === 'number' 
            ? data.color.toString(16).padStart(6, '0')
            : data.color.toString().replace('#', '');
        dot.style.color = '#' + colorHex;

        // Add label (hidden by default)
        const label = document.createElement('div');
        label.className = 'planet-label';
        label.textContent = data.name;
        dot.appendChild(label);

        // Add click listener (fallback interaction)
        dot.addEventListener('click', () => {
            console.log('Clicked planet:', data.name);
        });

        this.container.appendChild(dot);
        this.dots.set(planet, dot);
    }

    /**
     * Update positions of all dots based on 3D scene
     */
    update(camera) {
        if (!camera) return;

        this.dots.forEach((dot, planet) => {
            // Get screen position
            const screenPos = this.toScreenPosition(planet, camera);

            // Check visibility (behind camera?)
            if (screenPos.z > 1) {
                dot.style.opacity = 0;
                return;
            } else {
                // Restore opacity (unless it's set to active/inactive elsewhere)
                dot.style.opacity = dot.classList.contains('active') ? 1 : 0.8;
            }

            // Update CSS position
            // screenPos.x/y are in -1 to 1 range
            const x = (screenPos.x + 1) * 0.5 * window.innerWidth;
            const y = (-screenPos.y + 1) * 0.5 * window.innerHeight;

            dot.style.left = `${x}px`;
            dot.style.top = `${y}px`;

            // Scale based on distance (simple perspective scale simulation)
            // Closer planets = larger dots
            const distance = planet.position.distanceTo(camera.position);
            // Prevent divide by zero
            const safeDistance = Math.max(distance, 0.1);
            const scale = Math.max(0.5, Math.min(2.0, 30 / safeDistance));

            // Only apply scale if not active (active has its own scale)
            if (!dot.classList.contains('active')) {
                dot.style.transform = `translate(-50%, -50%) scale(${scale})`;
            }
        });
    }

    /**
     * Update visual cursor position
     * @param {Object} position - Normalized {x, y} (0 to 1) from Hand Tracker
     */
    updateCursor(position) {
        if (!position) {
            this.cursor.classList.add('hidden');
            return;
        }

        this.cursor.classList.remove('hidden');

        // Convert normalized coords to screen pixels
        // Note: Hand tracking sometimes uses mirrored X, gesture-controller usually handles it.
        // Assuming position is already correct screen-space normalized (0=left, 1=right).
        const x = position.x * window.innerWidth;
        const y = position.y * window.innerHeight;

        this.cursor.style.left = `${x}px`;
        this.cursor.style.top = `${y}px`;

        // Check intersection with dots
        this.checkInteractions(x, y);
    }

    /**
     * Check overlapping between cursor and dots
     * OPTIMIZED: Use cached positions from update() instead of getBoundingClientRect()
     */
    checkInteractions(cursorX, cursorY) {
        let hit = null;
        let minDistance = Infinity;
        const threshold = 50; // Distance in pixels

        this.dots.forEach((dot, planet) => {
            // Use cached position from update() if available (much faster)
            let dotX, dotY;
            if (dot._cachedX !== undefined && dot._cachedY !== undefined) {
                dotX = dot._cachedX;
                dotY = dot._cachedY;
            } else {
                // Fallback to getBoundingClientRect if cache not available
                const rect = dot.getBoundingClientRect();
                dotX = rect.left + rect.width / 2;
                dotY = rect.top + rect.height / 2;
            }

            const dx = cursorX - dotX;
            const dy = cursorY - dotY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < threshold && distance < minDistance) {
                minDistance = distance;
                hit = planet;
            }
        });

        if (hit) {
            this.activatePlanet(hit);
        } else {
            this.deactivateAll();
        }
    }

    /**
     * Activate a planet (Visual Highlight + Start Timer)
     */
    activatePlanet(planet) {
        if (this.activePlanet === planet) return;

        // Clear any existing timer first
        if (this.selectionTimer) {
            clearTimeout(this.selectionTimer);
            this.selectionTimer = null;
        }

        this.deactivateAll();
        this.activePlanet = planet;

        const dot = this.dots.get(planet);
        if (dot) {
            dot.classList.add('active');

            // Visual Feedback: Start a timer for 2 seconds
            // The "Ripple" animation in CSS takes 2s, so it matches perfectly visually.

            this.selectionTimer = setTimeout(() => {
                // Timer finished! Select the planet.
                // Check if planet is still active and component still exists
                if (this.activePlanet === planet && this.dots.has(planet)) {
                    const event = new CustomEvent('planet-selected', { detail: { planet: planet } });
                    window.dispatchEvent(event);
                }
                this.selectionTimer = null; // Clear reference
            }, 2000); // 2 seconds hold
        }
    }

    /**
     * Deactivate all dots
     */
    deactivateAll() {
        if (!this.activePlanet) return;

        // Clear any pending selection timer
        if (this.selectionTimer) {
            clearTimeout(this.selectionTimer);
            this.selectionTimer = null;
        }

        this.dots.forEach(dot => dot.classList.remove('active'));
        this.activePlanet = null;

        // Dispatch exit event
        window.dispatchEvent(new CustomEvent('planet-hover-end'));
    }

    /**
     * Helper: Project 3D position to 2D screen space
     */
    toScreenPosition(obj, camera) {
        const vector = new THREE.Vector3();

        // Get center position
        obj.updateWorldMatrix(true, false);
        obj.getWorldPosition(vector);

        vector.project(camera);

        return vector;
    }
}
