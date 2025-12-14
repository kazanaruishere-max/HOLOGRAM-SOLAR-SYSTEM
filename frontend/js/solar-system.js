/**
 * Solar System 3D Model
 * Creates realistic solar system with planets, orbits, and lighting effects
 */

class SolarSystem {
    constructor(scene) {
        this.scene = scene;
        this.planets = [];
        this.orbits = [];
        this.starfield = null;
        this.sun = null;
        this.scaleMode = false; // false = view mode (visible sizes), true = scale mode (accurate sizes)
        
        // Planet data (accurate relative sizes and distances)
        this.planetData = [
            { name: 'Mercury', distance: 5, size: 0.38, color: 0x8c7853, period: 0.24, speed: 1.6 },
            { name: 'Venus', distance: 7, size: 0.95, color: 0xffc649, period: 0.62, speed: 1.2 },
            { name: 'Earth', distance: 10, size: 1.0, color: 0x6b93d6, period: 1.0, speed: 1.0 },
            { name: 'Mars', distance: 15, size: 0.53, color: 0xc1440e, period: 1.88, speed: 0.8 },
            { name: 'Jupiter', distance: 25, size: 11.2, color: 0xd8ca9d, period: 11.86, speed: 0.4 },
            { name: 'Saturn', distance: 35, size: 9.4, color: 0xfad5a5, period: 29.46, speed: 0.3 },
            { name: 'Uranus', distance: 45, size: 4.0, color: 0x4fd0e7, period: 84.01, speed: 0.2 },
            { name: 'Neptune', distance: 55, size: 3.9, color: 0x4b70dd, period: 164.79, speed: 0.15 }
        ];
        
        // View mode sizes (scaled for visibility)
        this.viewModeSizes = [0.5, 0.6, 0.7, 0.5, 1.5, 1.3, 0.8, 0.8];
    }
    
    /**
     * Create the entire solar system
     */
    create() {
        // Create starfield background
        this.createStarfield();
        
        // Create sun
        this.createSun();
        
        // Create planets and orbits
        this.planetData.forEach((data, index) => {
            this.createOrbit(data.distance);
            this.createPlanet(data, index);
        });
    }
    
    /**
     * Create starfield background - OPTIMIZED for FPS
     */
    createStarfield() {
        const starGeometry = new THREE.BufferGeometry();
        // Reduced star count from 2000 to 1000 (still looks good, better FPS)
        const starCount = 1000;
        const positions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 2000;
            positions[i + 1] = (Math.random() - 0.5) * 2000;
            positions[i + 2] = (Math.random() - 0.5) * 2000;
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: false  // Disable for better FPS
        });
        
        this.starfield = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(this.starfield);
    }
    
    /**
     * Create the sun with glow effect - OPTIMIZED for FPS
     */
    createSun() {
        // Reduced segments for better FPS (32->24, still looks good)
        const sunGeometry = new THREE.SphereGeometry(2, 24, 24);
        
        // Emissive material for sun (MeshBasicMaterial is faster)
        const sunMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            emissive: 0xff6600,
            emissiveIntensity: 1.5
        });
        
        this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
        this.sun.position.set(0, 0, 0);
        this.sun.castShadow = false;  // Disabled for FPS
        this.sun.receiveShadow = false;
        this.sun.userData = { name: 'Sun', type: 'star' };
        
        // Add glow effect using additional sphere (reduced segments)
        const glowGeometry = new THREE.SphereGeometry(2.2, 24, 24);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.sun.add(glow);
        
        // Add point light at sun position
        const sunLight = new THREE.PointLight(0xffffff, 2, 200);
        sunLight.position.set(0, 0, 0);
        this.scene.add(sunLight);
        
        this.scene.add(this.sun);
    }
    
    /**
     * Create orbital path ring - OPTIMIZED for FPS
     */
    createOrbit(radius) {
        // Reduced segments from 128 to 64 (still smooth, better FPS)
        const orbitGeometry = new THREE.RingGeometry(radius - 0.1, radius + 0.1, 64);
        const orbitMaterial = new THREE.MeshBasicMaterial({
            color: 0x444444,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.3
        });
        
        const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
        orbit.rotation.x = -Math.PI / 2;
        orbit.userData = { radius: radius };
        
        this.orbits.push(orbit);
        this.scene.add(orbit);
    }
    
    /**
     * Create a planet - OPTIMIZED for FPS with larger hitbox for selection
     */
    createPlanet(data, index) {
        // Determine size based on mode
        const size = this.scaleMode ? data.size * 0.3 : this.viewModeSizes[index];
        
        // Reduced segments from 32 to 24 (still looks good, better FPS)
        const planetGeometry = new THREE.SphereGeometry(size, 24, 24);
        
        // Use MeshBasicMaterial instead of MeshStandardMaterial for better FPS
        // (Still looks good with emissive color)
        const planetMaterial = new THREE.MeshBasicMaterial({
            color: data.color,
            emissive: data.color,
            emissiveIntensity: 0.2  // Subtle glow for realism
        });
        
        const planet = new THREE.Mesh(planetGeometry, planetMaterial);
        planet.position.set(data.distance, 0, 0);
        planet.castShadow = false;  // Disabled for FPS
        planet.receiveShadow = false;
        
        // Create invisible larger hitbox for easier selection (3x size)
        const hitboxSize = size * 3;
        const hitboxGeometry = new THREE.SphereGeometry(hitboxSize, 16, 16);
        const hitboxMaterial = new THREE.MeshBasicMaterial({
            visible: false,  // Invisible
            transparent: true
        });
        const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
        planet.add(hitbox);
        
        // Store planet data
        planet.userData = {
            name: data.name,
            type: 'planet',
            distance: data.distance,
            size: size,
            hitboxSize: hitboxSize,  // Store for selection
            period: data.period,
            speed: data.speed,
            angle: Math.random() * Math.PI * 2, // Random starting position
            originalData: data
        };
        
        // Add atmosphere for Earth (reduced segments)
        if (data.name === 'Earth') {
            const atmosphereGeometry = new THREE.SphereGeometry(size * 1.05, 24, 24);
            const atmosphereMaterial = new THREE.MeshBasicMaterial({
                color: 0x6b93d6,
                transparent: true,
                opacity: 0.2
            });
            const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
            planet.add(atmosphere);
        }
        
        // Add rings for Saturn (reduced segments)
        if (data.name === 'Saturn') {
            const ringGeometry = new THREE.RingGeometry(size * 1.2, size * 2, 32);  // Reduced from 64
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0xfad5a5,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6
            });
            const rings = new THREE.Mesh(ringGeometry, ringMaterial);
            rings.rotation.x = -Math.PI / 2;
            planet.add(rings);
        }
        
        this.planets.push(planet);
        this.scene.add(planet);
    }
    
    /**
     * Update solar system animation - OPTIMIZED
     */
    update(deltaTime) {
        // Rotate sun (direct update, no interpolation for performance)
        if (this.sun) {
            this.sun.rotation.y += 0.01 * deltaTime;
        }
        
        // Update planet positions (orbital motion) - optimized loop
        const planetCount = this.planets.length;
        for (let i = 0; i < planetCount; i++) {
            const planet = this.planets[i];
            const data = planet.userData;
            
            // Update orbital angle
            data.angle += data.speed * deltaTime * 0.1;
            
            // Calculate new position directly (faster than lerp)
            const cosAngle = Math.cos(data.angle);
            const sinAngle = Math.sin(data.angle);
            planet.position.x = cosAngle * data.distance;
            planet.position.z = sinAngle * data.distance;
            
            // Rotate planet on its axis
            planet.rotation.y += 0.02 * deltaTime;
        }
        
        // Rotate starfield slowly (only if visible)
        if (this.starfield && this.starfield.visible) {
            this.starfield.rotation.y += 0.0001 * deltaTime;
        }
    }
    
    /**
     * Set scale mode (accurate vs visible sizes)
     */
    setScaleMode(enabled) {
        this.scaleMode = enabled;
        
        this.planets.forEach((planet, index) => {
            const data = planet.userData.originalData;
            const newSize = enabled ? data.size * 0.3 : this.viewModeSizes[index];
            
            // Create new geometry with new size (reduced segments for FPS)
            const newGeometry = new THREE.SphereGeometry(newSize, 24, 24);
            planet.geometry.dispose();
            planet.geometry = newGeometry;
            
            planet.userData.size = newSize;
        });
    }
    
    /**
     * Reset solar system to initial state
     */
    reset() {
        this.planets.forEach(planet => {
            const data = planet.userData;
            data.angle = Math.random() * Math.PI * 2;
            planet.position.set(data.distance, 0, 0);
        });
    }
    
    /**
     * Get planet by raycast
     */
    getPlanetByRaycast(raycaster) {
        const intersects = raycaster.intersectObjects(this.planets);
        if (intersects.length > 0) {
            return intersects[0].object;
        }
        return null;
    }
    
    /**
     * Get all planets
     */
    getPlanets() {
        return this.planets;
    }
    
    /**
     * Get planet data for info display
     */
    getPlanetInfo(planet) {
        if (!planet || !planet.userData) return null;
        
        const data = planet.userData.originalData;
        return {
            name: data.name,
            distance: `${data.distance.toFixed(1)} AU`,
            diameter: `${(data.size * 12742).toFixed(0)} km`, // Earth diameter = 12742 km
            period: `${data.period.toFixed(2)} Earth years`
        };
    }
}

