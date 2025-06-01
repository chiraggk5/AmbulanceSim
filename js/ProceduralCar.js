// js/ProceduralCar.js
import * as THREE from 'three';
import { Config } from './Config.js';
import { TrafficLight } from './TrafficLight.js'; // For TrafficLight.LIGHT_STATE

export class ProceduralCar {
    constructor(scene, position, color = 0xff0000, length = 2.8, width = 1.3, height = 1.1) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.position.copy(position);
        
        const safeRoadSurfaceY = Config.roadSurfaceY ?? 0;
        const wheelRadius = height * 0.25; 
        this.group.position.y = safeRoadSurfaceY + wheelRadius; // Position car so wheels are on road surface

        this.color = color;
        this.length = length;
        this.carWidth = width;
        this.height = height; // Overall height of the car model

        this.lane = 0; // Lane relative to road center (e.g., -1 or 1)
        this.initialZ = position.z; // Original Z position in its lane
        this.speed = 0.1; // Base speed, direction will be set from main.js
        
        this.isEvading = false;
        this.targetZ = this.group.position.z; // Current Z target (for lane changes/evasion)
        this.evadeDirection = 0; // Not directly used, logic relies on targetZ

        this.isApproachingJunction = null; // Stores ref to junction data object if approaching
        this.currentSpeed = 0; // Actual current speed, can be 0 if stopped
        this.isStoppedForLight = false;

        this.buildCar();
        this.scene.add(this.group);
        this.currentSpeed = this.speed; // Initialize currentSpeed
    }

    buildCar() {
        // Car Body
        const bodyGeo = new THREE.BoxGeometry(this.length, this.height * 0.6, this.carWidth);
        const bodyMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.4, metalness: 0.3 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        body.position.y = 0; // Body center relative to group's Y (which is wheel base)
        this.group.add(body);

        // Cabin
        const cabinHeight = this.height * 0.45;
        const cabinGeo = new THREE.BoxGeometry(this.length * 0.55, cabinHeight, this.carWidth * 0.85);
        const cabinMat = bodyMat.clone(); // Can use same material or a slightly different one
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(this.length * 0.0, this.height * 0.25, 0); // Position cabin on top of body, slightly back
        cabin.castShadow = true;
        body.add(cabin); // Add cabin as child of body for easier transforms if body tilts
        
        // Windows
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x102030, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.6 });
        
        // Front Windshield
        const fWindowGeo = new THREE.PlaneGeometry(this.carWidth * 0.75, cabinHeight * 0.6);
        const fWindow = new THREE.Mesh(fWindowGeo, windowMat);
        fWindow.position.set(this.length * 0.275, cabinHeight * 0.05, 0); // Front of cabin
        fWindow.rotation.y = Math.PI; // Facing forward relative to cabin
        fWindow.rotation.x = -Math.PI / 12; // Slanted
        cabin.add(fWindow);

        // Side Windows
        const sideWindowGeo = new THREE.PlaneGeometry(this.length*0.4, cabinHeight * 0.55);
        const sWindowL = new THREE.Mesh(sideWindowGeo, windowMat);
        sWindowL.position.set(0,0, this.carWidth*0.425); // Left side of cabin
        sWindowL.rotation.y = Math.PI/2;
        cabin.add(sWindowL);

        const sWindowR = new THREE.Mesh(sideWindowGeo, windowMat);
        sWindowR.position.set(0,0, -this.carWidth*0.425); // Right side of cabin
        sWindowR.rotation.y = -Math.PI/2;
        cabin.add(sWindowR);

        // Wheels
        const wheelRadius = this.height * 0.22;
        const wheelActualWidth = this.carWidth * 0.12; // Thickness of the wheel
        const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelActualWidth, 16);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.8 });
        // Wheel Y offset: from group center (axle height) down to base of body, then adjust by wheel radius
        const wheelYOffsetFromBodyCenter = -this.height * 0.3 + wheelRadius; 
        const wheelYOffset = - (this.height * 0.6 / 2) + wheelRadius; // Position relative to group origin (bottom of wheels)

        const wheelPositions = [
            new THREE.Vector3(this.length * 0.38, 0, this.carWidth / 2 + wheelActualWidth/2 - this.carWidth*0.05), // Front-Right
            new THREE.Vector3(this.length * 0.38, 0, -this.carWidth / 2 - wheelActualWidth/2 + this.carWidth*0.05),// Front-Left
            new THREE.Vector3(-this.length * 0.38,0, this.carWidth / 2 + wheelActualWidth/2 - this.carWidth*0.05),// Rear-Right
            new THREE.Vector3(-this.length * 0.38,0, -this.carWidth / 2 - wheelActualWidth/2 + this.carWidth*0.05) // Rear-Left
        ];
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            // The group is already at wheel-base Y. Wheels should be at Y=0 relative to group if group.position.y is axle height.
            // If group.position.y means "bottom of wheels", then wheel.position.y should be wheelRadius.
            // Given constructor sets group.position.y = safeRoadSurfaceY + wheelRadius, wheels should be at y=0 in local group space.
            wheel.position.copy(pos);
            wheel.position.y = 0; // Centered at the group's Y, which is axle height
            wheel.rotation.x = Math.PI / 2; // Rotate cylinder to be a wheel
            wheel.castShadow = true;
            this.group.add(wheel);
        });
    }
    
    update(deltaTime) {
        if (!this.isStoppedForLight || this.isEvading) { // Move if not stopped OR if evading (evading might override stopping)
             this.group.position.x += this.currentSpeed * deltaTime * 60; // currentSpeed includes direction
        }
       
        // Wrap around logic for X position
        const roadExtentX = (Config.numJunctions * Config.junctionSize + (Config.numJunctions + 1) * Config.roadLength) / 2 + this.length*2;
        if (this.currentSpeed > 0 && this.group.position.x > roadExtentX) { // Moving East
            this.group.position.x = -roadExtentX;
        } else if (this.currentSpeed < 0 && this.group.position.x < -roadExtentX) { // Moving West
             this.group.position.x = roadExtentX;
        }

        // Smoothly move to targetZ (for lane changes / evasion)
        if (Math.abs(this.group.position.z - this.targetZ) > 0.01) {
            this.group.position.z = THREE.MathUtils.damp(this.group.position.z, this.targetZ, 5, deltaTime); // 5 is a damping factor
        } else {
            this.group.position.z = this.targetZ;
            // If not evading and Z is not initial Z, snap back (this handles returning to lane after evasion)
            if (!this.isEvading && this.group.position.z !== this.initialZ) {
                this.targetZ = this.initialZ; 
            }
        }

        // Restore speed if not stopped and not evading
        if (!this.isStoppedForLight && !this.isEvading && Math.abs(this.currentSpeed) < Math.abs(this.speed)) {
            this.currentSpeed = this.speed; // Restore to original speed (with direction)
        }
        // Ensure speed is zero if stopped and not evading
         if (this.isStoppedForLight && !this.isEvading) {
            this.currentSpeed = 0;
        }
    }

    checkAndHandleTrafficLight(junctionData, trafficLight, ambulanceIsVeryCloseAndNeedsWay) {
        if (!junctionData || !trafficLight) { // No relevant junction or light
            if (this.isStoppedForLight) this.isStoppedForLight = false;
            if (!this.isEvading) { 
                 this.currentSpeed = this.speed; // Resume normal speed if not evading
            }
            return;
        }

        const carDirectionSign = Math.sign(this.speed); // +1 for Eastbound, -1 for Westbound
        // Distance to junction center along car's X direction of travel. Positive if junction is ahead.
        const distToJunctionCenterX = (junctionData.center.x - this.group.position.x) * carDirectionSign;

        // If ambulance is very close and car is trying to move (or stopped), let it creep
        if (ambulanceIsVeryCloseAndNeedsWay && (this.isStoppedForLight || this.currentSpeed < Math.abs(this.speed))) {
            if (this.isEvading) { // Only creep if also evading (to make space)
                this.isStoppedForLight = false; // Override light stopping
                this.currentSpeed = this.speed * 0.3; // Creep forward slowly
                return; // Don't process normal light logic if creeping for ambulance
            }
        }

        // Check light state only if car is approaching the junction from the front
        if (distToJunctionCenterX > 0 && distToJunctionCenterX < Config.carDetectionDistanceToJunction) {
            const lightState = trafficLight.currentState;
            const effectiveStopDist = Config.carStopDistanceToJunction + this.length / 2; // Stop car's front before line

            if ((lightState === TrafficLight.LIGHT_STATE.RED || lightState === TrafficLight.LIGHT_STATE.YELLOW) &&
                distToJunctionCenterX < effectiveStopDist && distToJunctionCenterX > -this.length) { // If car is before or slightly past stop line
                if (!this.isEvading) { // Don't stop if actively evading unless ambulance logic changes this
                    this.isStoppedForLight = true;
                    this.currentSpeed = 0;
                }
            } else if (lightState === TrafficLight.LIGHT_STATE.GREEN) {
                this.isStoppedForLight = false;
                if (!this.isEvading) this.currentSpeed = this.speed; // Go if green and not evading
            } else if (this.isStoppedForLight && !(lightState === TrafficLight.LIGHT_STATE.RED || lightState === TrafficLight.LIGHT_STATE.YELLOW)) {
                // If was stopped, but light is no longer red/yellow (e.g. turned green)
                this.isStoppedForLight = false;
                if (!this.isEvading) this.currentSpeed = this.speed;
            }
        } else if (distToJunctionCenterX <= 0) { // Car has passed the junction center or is far beyond detection range
            this.isStoppedForLight = false; // No longer stopped for this light
        }
        // If no relevant junction was close enough to begin with (handled by the first 'if' in this method), speed is restored there.
    }

    startEvade(ambulanceTargetLaneZ) {
        if (this.isEvading && this.targetZ !== this.initialZ) return; // Already evading to a non-initial Z
        this.isEvading = true;
        
        const carOriginalLaneZ = this.initialZ; // Car's normal lane Z
        const roadEdgePositive = Config.roadWidth / 2 - this.carWidth / 2 - 0.2; // Safety margin from edge
        const roadEdgeNegative = -Config.roadWidth / 2 + this.carWidth / 2 + 0.2;

        // Determine if car is in the same general path as ambulance
        if (Math.abs(this.group.position.z - ambulanceTargetLaneZ) < Config.laneWidth * 0.8) { // If car is in/near ambulance's target Z
            // Evade away from ambulance
            if (ambulanceTargetLaneZ <= carOriginalLaneZ) { // Ambulance is to car's left or in same lane, car should move right
                this.targetZ = carOriginalLaneZ + Config.carEvadeShiftZ; 
                if (this.targetZ > roadEdgePositive) this.targetZ = roadEdgePositive; // Don't go off-road
            } else { // Ambulance is to car's right, car should move left
                this.targetZ = carOriginalLaneZ - Config.carEvadeShiftZ; 
                if (this.targetZ < roadEdgeNegative) this.targetZ = roadEdgeNegative; // Don't go off-road
            }
        } else { 
            // Ambulance is in a different lane, no need to evade, or car is already clear.
            this.targetZ = this.initialZ; 
            this.isEvading = false; // Not actively evading if ambulance isn't conflicting
        }
    }

    stopEvade() {
        if (!this.isEvading && Math.abs(this.group.position.z - this.initialZ) < 0.1) return; // Already back in lane or wasn't evading
        this.isEvading = false;
        this.targetZ = this.initialZ; // Target back to original lane
        // Speed will be restored in update() or checkAndHandleTrafficLight() if not stopped for light
    }
}