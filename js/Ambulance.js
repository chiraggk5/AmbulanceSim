// js/Ambulance.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Config } from './Config.js';

export class Ambulance {
    constructor(scene, camera, pathPoints) {
        this.scene = scene;
        this.camera = camera;
        this.path = pathPoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
        this.currentPathIndex = 0;
        this.speed = Config.ambulanceSpeed;
        this.group = new THREE.Group();

        if (this.path.length > 0) {
            this.group.position.copy(this.path[0]);
            if (this.path.length > 1) {
                // Look at the next point in the path to set initial orientation
                this.group.lookAt(this.path[1].x, this.group.position.y, this.path[1].z);
            }
        } else {
            // Fallback if path is empty
            console.warn("Ambulance path is empty.");
        }

        this.model = null;
        this.sirenSound = null;
        this.sirenLight1 = null;
        this.sirenLight2 = null;
        this.sirenLightOn = false;
        this.sirenLightTimer = null;
        this.isDeactivating = false;
        this.fadeOutTimer = 0;
        this.hasFadedOut = false;

        this.loadAndCreateModel();
        this.setupSirenSound();
        this.scene.add(this.group);
    }

    async loadAndCreateModel() {
        const loader = new GLTFLoader();
        try {
            const modelPath = Config.ambulanceModelFile || 'assets/models/ambulance.glb';
            const gltf = await loader.loadAsync(modelPath);
            this.model = gltf.scene;
            
            const scaleFactor = Config.ambulanceScaleFactor || 0.05;
            this.model.scale.set(scaleFactor, scaleFactor, scaleFactor);
            this.model.rotation.y = Math.PI / 2; 
            this.model.position.y = Config.ambulanceModelYAdjust || 0.0;

            this.model.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    if (child.material) {
                        child.material.transparent = true; 
                        child.material.needsUpdate = true;
                    }
                }
            });
            this.group.add(this.model);
            this.createSirenLightsPlaceholder();
        } catch (error) {
            console.error('Failed to load ambulance model, using placeholder:', error);
            const geom = new THREE.BoxGeometry(3.5, 1.8, 1.5);
            const mat = new THREE.MeshStandardMaterial({ color: 0xffdddd, transparent: true });
            this.model = new THREE.Mesh(geom, mat);
            this.model.castShadow = true;
            this.model.position.y = 1.8 / 2;
            this.group.add(this.model);
            this.createSirenLightsPlaceholder();
        }
        this.animateSirenLights();
    }

    createSirenLightsPlaceholder() {
        const modelRenderHeight = 1.8; // Approximate visual height of placeholder or simple model
        const lightYPos = (this.model ? this.model.position.y : 0) + modelRenderHeight * 0.5 + 0.2;

        const lightGeo = new THREE.SphereGeometry(0.15, 16, 8);
        const matRed = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x550000, emissiveIntensity: 1, transparent: true, opacity: 1.0 });
        const matBlue = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x000055, emissiveIntensity: 1, transparent: true, opacity: 1.0 });

        this.sirenLight1 = new THREE.Mesh(lightGeo, matRed);
        this.sirenLight1.position.set(0.3, lightYPos, (this.model ? this.model.position.z : 0) + 0.3);
        this.group.add(this.sirenLight1);

        this.sirenLight2 = new THREE.Mesh(lightGeo, matBlue);
        this.sirenLight2.position.set(-0.3, lightYPos, (this.model ? this.model.position.z : 0) + 0.3);
        this.group.add(this.sirenLight2);
    }

    animateSirenLights() {
        if (this.sirenLightTimer) clearInterval(this.sirenLightTimer);
        this.sirenLightTimer = setInterval(() => {
            if (!this.sirenLight1 || !this.sirenLight2) return;
            this.sirenLightOn = !this.sirenLightOn;
            this.sirenLight1.material.emissive.setHex(this.sirenLightOn ? 0xff0000 : 0x330000);
            this.sirenLight2.material.emissive.setHex(this.sirenLightOn ? 0x000033 : 0x0000ff);
            this.sirenLight1.material.emissiveIntensity = this.sirenLightOn ? 2.0 : 0.5;
            this.sirenLight2.material.emissiveIntensity = !this.sirenLightOn ? 2.0 : 0.5;
        }, 300);
    }

    setupSirenSound() {
        if (!this.camera) {
            console.warn("Ambulance: Camera not provided for siren sound.");
            return;
        }
        let listener = this.camera.children.find(child => child.type === "AudioListener");
        if(!listener){
            listener = new THREE.AudioListener();
            this.camera.add(listener);
        }
        this.sirenSound = new THREE.PositionalAudio(listener);
        const audioLoader = new THREE.AudioLoader();
        if (!Config.sirenAudioFile) {
            console.warn("Siren audio file not specified in Config.");
            return;
        }
        audioLoader.load(Config.sirenAudioFile, (buffer) => {
            this.sirenSound.setBuffer(buffer);
            this.sirenSound.setRefDistance(20); 
            this.sirenSound.setRolloffFactor(2.5); 
            this.sirenSound.setLoop(true);
            this.sirenSound.setVolume(0.7); 
        }, () => {}, (err) => { console.error('Error loading siren audio:', Config.sirenAudioFile, err); });
        this.group.add(this.sirenSound);
    }

    startSiren() {
    if (this.sirenSound && this.sirenSound.buffer && !this.sirenSound.isPlaying) {
        // --- BEGIN AUTOPLAY FIX ---
        const listener = this.sirenSound.listener; // THREE.AudioListener
        if (listener && listener.context.state === 'suspended') {
            listener.context.resume().then(() => {
                console.log("AudioContext resumed successfully by user gesture (or was already running).");
                this.sirenSound.play();
                const sirenStatusEl = document.getElementById('sirenStatus');
                if(sirenStatusEl) sirenStatusEl.textContent = 'Playing';
            }).catch(e => console.error("Error resuming AudioContext:", e));
        } else if (listener && listener.context.state === 'running') {
             this.sirenSound.play();
             const sirenStatusEl = document.getElementById('sirenStatus');
             if(sirenStatusEl) sirenStatusEl.textContent = 'Playing';
        } else {
            // Fallback or if context is in a weird state - try playing directly
            // but this might be blocked if context was never started by user.
            console.warn("AudioContext state is not 'suspended' or 'running', attempting to play anyway. State: " + (listener ? listener.context.state : "unknown"));
            this.sirenSound.play();
            const sirenStatusEl = document.getElementById('sirenStatus');
            if(sirenStatusEl) sirenStatusEl.textContent = 'Playing';
        }
        // --- END AUTOPLAY FIX ---
    } else if (this.sirenSound && !this.sirenSound.buffer) {
         console.warn("Siren sound buffer not loaded yet.");
    }
}

    stopSiren() {
        if (this.sirenSound && this.sirenSound.isPlaying) {
            this.sirenSound.stop();
            const sirenStatusEl = document.getElementById('sirenStatus');
            if(sirenStatusEl) sirenStatusEl.textContent = 'Stopped';
        }
    }

    update(deltaTime) { 
        if (this.hasFadedOut) return;

        if (this.isDeactivating) {
            this.fadeOutTimer += deltaTime;
            const fadeDuration = Config.ambulanceFadeOutDuration || 2.0;
            const fadeProgress = Math.min(1, this.fadeOutTimer / fadeDuration);
            const newOpacity = Math.max(0, 1.0 - fadeProgress);
            const newScale = Math.max(0.001, 1.0 - fadeProgress); 

            if (this.model) {
                this.model.traverse(child => {
                    if (child.isMesh && child.material) child.material.opacity = newOpacity;
                });
            }
            if (this.sirenLight1?.material) this.sirenLight1.material.opacity = newOpacity;
            if (this.sirenLight2?.material) this.sirenLight2.material.opacity = newOpacity;
            
            this.group.scale.set(newScale, newScale, newScale);

            if (fadeProgress >= 1) this.hasFadedOut = true;
            return; 
        }

        if (!this.path || this.path.length === 0 || this.currentPathIndex >= this.path.length || !this.model) return;

        const targetPosition = this.path[this.currentPathIndex];
        const currentPosition = this.group.position;
        const directionToTarget = new THREE.Vector3().subVectors(targetPosition, currentPosition);
        const distanceToTargetSq = directionToTarget.lengthSq();
        
        const moveSpeed = this.speed; // Using speed as units per update call (can be made deltaTime independent if needed)
                                   // For deltaTime independence: const moveSpeed = this.speed * deltaTime;
        
        if (distanceToTargetSq < (moveSpeed * moveSpeed * 0.1) || distanceToTargetSq < 0.01) { // If close enough or reached
            this.currentPathIndex++;
            if (this.currentPathIndex >= this.path.length) {
                this.deactivate(); 
                return;
            }
        } else {
            directionToTarget.normalize();
            this.group.position.addScaledVector(directionToTarget, moveSpeed);
            
            let lookAtPos = this.path[this.currentPathIndex]; // Default to current target
            // For smoother turning, look at the *next* point if available and not too close to current target
            if (this.currentPathIndex + 1 < this.path.length) {
                 const nextTargetPosition = this.path[this.currentPathIndex + 1];
                 if (targetPosition.distanceToSquared(nextTargetPosition) > 0.1) { // If next target is distinct
                    lookAtPos = nextTargetPosition;
                 }
            }
            // Ensure the ambulance only rotates around its Y (up) axis
            this.group.lookAt(lookAtPos.x, this.group.position.y , lookAtPos.z);
        }
    }

    getPosition() { return this.group.position; }

    getDirection() {
        const forward = new THREE.Vector3();
        this.group.getWorldDirection(forward); // Populates 'forward' with the world direction of the group's local -Z axis
        // The local -Z axis is what points "forward" after a lookAt() call.
        return forward.normalize();
    }

    activate() {
        this.currentPathIndex = 0;
        this.isDeactivating = false;
        this.hasFadedOut = false;
        this.fadeOutTimer = 0;
        this.group.scale.set(1,1,1); 

        if (this.model) { 
            this.model.traverse(child => {
                if (child.isMesh && child.material) child.material.opacity = 1.0;
            });
        }
        if(this.sirenLight1?.material) this.sirenLight1.material.opacity = 1.0;
        if(this.sirenLight2?.material) this.sirenLight2.material.opacity = 1.0;

        if (this.path && this.path.length > 0) {
             this.group.position.copy(this.path[0]);
             // Re-orient if needed
             if (this.path.length > 1) {
                this.group.lookAt(this.path[1].x, this.group.position.y, this.path[1].z);
            }
        }
        this.startSiren();
        if (this.sirenLightTimer === null && this.sirenLight1) this.animateSirenLights();
        
        const ambulanceStatusEl = document.getElementById('ambulanceStatus');
        if(ambulanceStatusEl) ambulanceStatusEl.textContent = 'Approaching';
    }

    deactivate() {
        this.isDeactivating = true; 
        this.stopSiren();
        if (this.sirenLightTimer) {
            clearInterval(this.sirenLightTimer);
            this.sirenLightTimer = null;
        }
        const ambulanceStatusEl = document.getElementById('ambulanceStatus');
        if(ambulanceStatusEl) ambulanceStatusEl.textContent = 'Reached Destination / Fading';
    }
}
