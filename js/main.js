// js/main.js
import * as THREE from 'three';
import { SceneSetup } from './SceneSetup.js';
import { Road } from './Road.js';
import { TrafficLight } from './TrafficLight.js';
import { SmartReflector } from './SmartReflector.js';
import { Ambulance } from './Ambulance.js';
import { ProceduralBuilding } from './ProceduralBuilding.js';
import { ProceduralCar } from './ProceduralCar.js';
import { ProceduralPedestrian } from './ProceduralPedestrian.js';
import { Config } from './Config.js';

const JUNCTION_PHASES = {
    EW_GREEN: 'EW_GREEN', EW_YELLOW: 'EW_YELLOW',
    NS_GREEN: 'NS_GREEN', NS_YELLOW: 'NS_YELLOW',
    ALL_RED: 'ALL_RED'
};
const JUNCTION_CYCLE_DEFINITION = [
    { phase: JUNCTION_PHASES.EW_GREEN, duration: Config.trafficLightGreenDuration || 7000 },
    { phase: JUNCTION_PHASES.EW_YELLOW, duration: Config.trafficLightYellowDuration || 2000 },
    { phase: JUNCTION_PHASES.ALL_RED, duration: 1000 }, // Brief all-red phase
    { phase: JUNCTION_PHASES.NS_GREEN, duration: Config.trafficLightGreenDuration || 7000 },
    { phase: JUNCTION_PHASES.NS_YELLOW, duration: Config.trafficLightYellowDuration || 2000 },
    { phase: JUNCTION_PHASES.ALL_RED, duration: 1000 }  // Brief all-red phase
];


class Simulation {
    constructor() {
        this.sceneSetup = new SceneSetup();
        if(this.sceneSetup.renderer) this.sceneSetup.scene.userData.renderer = this.sceneSetup.renderer; // For texture anisotropy in ProceduralBuilding

        this.road = new Road(this.sceneSetup.scene);
        this.clock = new THREE.Clock();

        this.junctions = [];
        this.ambulance = null;
        this.proceduralBuildings = [];
        this.proceduralCars = [];
        this.proceduralPedestrians = [];

        this.cinematicCamera = {
            active: Config.useCinematicCamera,
            targetPosition: new THREE.Vector3(),
            targetLookAt: new THREE.Vector3(),
            currentLookAtSmooth: new THREE.Vector3(),
            logCounter: 0, // For occasional logging if needed
        };

        if(this.cinematicCamera.active && this.sceneSetup.camera){
            this.cinematicCamera.targetPosition.copy(this.sceneSetup.camera.position);
            this.cinematicCamera.targetLookAt.set(0,0,0); // Initial lookAt, will be updated
            this.cinematicCamera.currentLookAtSmooth.copy(this.cinematicCamera.targetLookAt);
        }

        this.setupEnvironment();
        this.setupProceduralAssets();
        this.setupAmbulance(); 
        this.animate();
    }

    setupEnvironment() {
        const safeRoadSurfaceY = Config.roadSurfaceY ?? 0;
        const footpathHeight = safeRoadSurfaceY + (Config.footpathHeightOffset || 0.05);

        for (let i = 0; i < Config.numJunctions; i++) {
            const junctionCenter = this.road.getJunctionCenter(i);
            if (!junctionCenter) {
                console.warn(`Junction center for index ${i} not found.`);
                continue;
            }

            const junctionData = {
                id: i,
                center: junctionCenter,
                trafficLights: [],
                reflectors: [],
                reflectorChain: [], // Reflectors that have been activated in sequence
                isAmbulanceApproaching: false, 
                hasAmbulancePassed: false,
                currentPhaseIndex: 0, // Start with the first phase of the cycle
                currentPhaseTimer: (JUNCTION_CYCLE_DEFINITION[0].duration || 1000) / 1000, // Duration in seconds
                isUnderNormalCycle: true
            };
            
            const trafficLightPoleBaseY = footpathHeight; 
            const footpathW = Config.footpathWidth || 1.5;

            // Traffic Light Positions (relative to junction center)
            // Adjusted for footpath width and to be on the correct side of the road
            const tlPositions = [ 
                // For traffic approaching from North (South-Bound light on SW corner)
                { pos: new THREE.Vector3(junctionCenter.x - Config.roadWidth / 2 - footpathW/2 - 0.5 , trafficLightPoleBaseY, junctionCenter.z - Config.junctionSize / 2 - 0.5), rot: Math.PI },
                // For traffic approaching from South (North-Bound light on NE corner)
                { pos: new THREE.Vector3(junctionCenter.x + Config.roadWidth / 2 + footpathW/2 + 0.5, trafficLightPoleBaseY, junctionCenter.z + Config.junctionSize / 2 + 0.5), rot: 0 },
                // For traffic approaching from East (West-Bound light on NW corner)
                { pos: new THREE.Vector3(junctionCenter.x + Config.junctionSize / 2 + 0.5, trafficLightPoleBaseY, junctionCenter.z - Config.roadWidth / 2 - footpathW/2 - 0.5 ), rot: Math.PI / 2 },
                // For traffic approaching from West (East-Bound light on SE corner)
                { pos: new THREE.Vector3(junctionCenter.x - Config.junctionSize / 2 - 0.5, trafficLightPoleBaseY, junctionCenter.z + Config.roadWidth / 2 + footpathW/2 + 0.5 ), rot: -Math.PI / 2 }
            ];

            tlPositions.forEach((tp, index) => {
                const trafficLight = new TrafficLight(tp.pos, tp.rot);
                trafficLight.id = `J${i}_TL${index}`; // Unique ID for debugging
                junctionData.trafficLights.push(trafficLight);
                this.sceneSetup.add(trafficLight.group); // Add to scene via SceneSetup
            });
            
            this.applyJunctionPhaseState(junctionData); // Initialize lights to current phase

            // Setup reflectors for the western approach to this junction
            const reflectorPositions = this.road.getReflectorPositions(i, 'west');
            reflectorPositions.forEach((pos) => { 
                const reflector = new SmartReflector(pos);
                junctionData.reflectors.push(reflector);
                this.sceneSetup.add(reflector.group); // Add to scene via SceneSetup
            });
            this.junctions.push(junctionData);
        }
    }

    getNoBuildZones() {
        const zones = [];
        const roadBuffer = 2.0; 
        const footpathTotalWidth = (Config.footpathWidth || 1.5) + 0.1 /*curb allowance*/;

        // Main East-West road corridor
        const totalRoadLengthEW = (Config.numJunctions + 1) * Config.roadLength + Config.numJunctions * Config.junctionSize;
        const ewRoadCorridorWidth = Config.roadWidth + footpathTotalWidth * 2 + roadBuffer * 2;
        zones.push({
            minX: -totalRoadLengthEW / 2 - Config.roadLength * 0.8, // Extend a bit beyond main road for visual continuity
            maxX: totalRoadLengthEW / 2 + Config.roadLength * 0.8,
            minZ: -ewRoadCorridorWidth / 2,
            maxZ: ewRoadCorridorWidth / 2,
            type: 'ew_road_corridor'
        });

        // North-South road corridors at each junction
        if (this.road && this.road.junctionCenters) {
            this.road.junctionCenters.forEach(center => {
                const nsRoadCorridorLength = Config.roadLength + Config.junctionSize + roadBuffer * 2; // Extent of N-S arms from junction center
                const nsRoadCorridorWidth = Config.roadWidth + footpathTotalWidth * 2 + roadBuffer * 2;
                
                zones.push({
                    minX: center.x - nsRoadCorridorWidth / 2,
                    maxX: center.x + nsRoadCorridorWidth / 2,
                    minZ: center.z - nsRoadCorridorLength / 2, // From south of junction
                    maxZ: center.z + nsRoadCorridorLength / 2, // To north of junction
                    type: 'ns_road_at_junction'
                });
            });
        }
        return zones;
    }

    isPositionSafeForBuilding(posX, posZ, buildingFootprintWidth, buildingFootprintDepth, noBuildZones) {
        const buildingMinX = posX - buildingFootprintWidth / 2;
        const buildingMaxX = posX + buildingFootprintWidth / 2;
        const buildingMinZ = posZ - buildingFootprintDepth / 2;
        const buildingMaxZ = posZ + buildingFootprintDepth / 2;

        for (const zone of noBuildZones) {
            // Check for overlap
            const xOverlap = Math.max(0, Math.min(buildingMaxX, zone.maxX) - Math.max(buildingMinX, zone.minX));
            const zOverlap = Math.max(0, Math.min(buildingMaxZ, zone.maxZ) - Math.max(buildingMinZ, zone.minZ));
            if (xOverlap > 0 && zOverlap > 0) {
                return false; // Overlaps with a no-build zone
            }
        }
        return true; // Safe to build
    }

    setupProceduralAssets() {
        const noBuildZones = this.getNoBuildZones();
        const safeRoadSurfaceY = Config.roadSurfaceY ?? 0;
        const footpathSurfaceY = safeRoadSurfaceY + (Config.footpathHeightOffset || 0.05);

        // === Add Procedural Buildings ===
        const cityBlocksX = Config.cityBlocksX || 5;
        const cityBlocksZ = Config.cityBlocksZ || 4;
        const blockSpacing = Config.blockSpacing || 65;
        const buildingsPerBlockAttempt = Config.buildingsPerBlockAttempt || 6;
        const maxBuildingsPerBlock = Config.maxBuildingsPerBlock || 4;
        const buildingSpreadFactor = Config.buildingSpreadFactor || 0.65;

        for (let bx = -Math.floor(cityBlocksX / 2); bx < Math.ceil(cityBlocksX / 2); bx++) {
            for (let bz = -Math.floor(cityBlocksZ / 2); bz < Math.ceil(cityBlocksZ / 2); bz++) {
                const blockCenterX = bx * blockSpacing;
                const blockCenterZ = bz * blockSpacing;

                let buildingsInBlock = 0;
                for (let i = 0; i < buildingsPerBlockAttempt && buildingsInBlock < maxBuildingsPerBlock; i++) {
                    const buildingBaseW = THREE.MathUtils.randFloat(12, 28);
                    const buildingBaseD = THREE.MathUtils.randFloat(12, 28);
                    
                    const spreadRangeX = blockSpacing * buildingSpreadFactor - buildingBaseW;
                    const spreadRangeZ = blockSpacing * buildingSpreadFactor - buildingBaseD;

                    const buildingPosX = blockCenterX + (spreadRangeX > 0 ? THREE.MathUtils.randFloatSpread(spreadRangeX) : 0);
                    const buildingPosZ = blockCenterZ + (spreadRangeZ > 0 ? THREE.MathUtils.randFloatSpread(spreadRangeZ) : 0);
                    
                    if (this.isPositionSafeForBuilding(buildingPosX, buildingPosZ, buildingBaseW, buildingBaseD, noBuildZones)) {
                        this.proceduralBuildings.push(new ProceduralBuilding(
                            this.sceneSetup.scene,
                            new THREE.Vector3(buildingPosX, safeRoadSurfaceY, buildingPosZ), // Base of building at road surface Y
                            buildingBaseW, 
                            buildingBaseD, 
                            THREE.MathUtils.randFloat(20, 75) // Varied heights
                        ));
                        buildingsInBlock++;
                    }
                }
            }
        }

        // === Add Procedural Cars ===
        const carColors = [0xc0392b, 0x27ae60, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x34495e, 0xbe90d4, 0x1abc9c];
        const numCars = Config.numberOfCars ?? 20;
        const roadExtentX = ((Config.numJunctions + 1) * Config.roadLength + Config.numJunctions * Config.junctionSize) / 2;

        for (let i = 0; i < numCars; i++) {
            const carTravelDir = Math.random() > 0.5 ? 1 : -1; // 1 for Eastbound, -1 for Westbound
            const carLaneRelDir = Math.random() > 0.5 ? 1 : -1; // Which side of the road centerline
            const carZPos = (Config.laneWidth / 2) * carLaneRelDir; // Z position based on lane
            const carXPos = THREE.MathUtils.randFloatSpread(roadExtentX * 1.9); // Random X start
            
            const car = new ProceduralCar(
                this.sceneSetup.scene,
                new THREE.Vector3(carXPos, 0, carZPos), // Y will be adjusted in car constructor
                carColors[Math.floor(Math.random() * carColors.length)]
            );
            car.lane = carLaneRelDir; 
            car.initialZ = carZPos; 
            car.targetZ = carZPos;
            car.speed = THREE.MathUtils.randFloat(Config.minCarSpeed || 0.08, Config.maxCarSpeed || 0.2) * carTravelDir;
            car.group.rotation.y = carTravelDir < 0 ? Math.PI : 0; // Face travel direction
            this.proceduralCars.push(car);
        }
        
        // === Add Procedural Pedestrians ===
        const numPedestrians = Config.numberOfPedestrians ?? 30;
        const actualFootpathCenterOffset = Config.roadWidth / 2 + 0.1 /*curb*/ + (Config.footpathWidth || 1.5) / 2;

        for (let i = 0; i < numPedestrians; i++) {
            const posX = THREE.MathUtils.randFloatSpread(roadExtentX * 1.9); // Spread along road
            const posZSign = Math.random() > 0.5 ? 1 : -1; // Which side of the road (North or South footpath)
            const pedHeight = THREE.MathUtils.randFloat(1.6, 1.9);
            
            // Initial position for pedestrian (feet on footpath)
            const pedInitialPos = new THREE.Vector3(
                posX, 
                footpathSurfaceY, // Feet on footpath surface
                actualFootpathCenterOffset * posZSign + THREE.MathUtils.randFloatSpread((Config.footpathWidth || 1.5) * 0.7) // Randomly within footpath width
            );
            
            const ped = new ProceduralPedestrian(
                this.sceneSetup.scene,
                pedInitialPos,
                pedHeight,
                new THREE.Color().setHSL(Math.random(), 0.6, 0.7) // Random clothing color
            );
            // ped.baseY is crucial for bobbing motion relative to the footpath.
            // It should be the Y where the center of the pedestrian model is, when feet are on ground.
            ped.baseY = footpathSurfaceY + pedHeight / 2; 
            ped.group.position.y = ped.baseY; // Set group's Y to be its center for easier animation later
            
            ped.speed = THREE.MathUtils.randFloat(0.015, 0.035);
            ped.direction = Math.random() > 0.5 ? 1 : -1; // Travel direction along X
            ped.footpathZ = ped.group.position.z; // Store their Z on the footpath
            ped.movementAxis = 'x'; // Assuming they walk along X for now
            this.proceduralPedestrians.push(ped);
        }
    }

    setupAmbulance() {
        const ambulancePath = this.road.getAmbulancePath();
        if (!ambulancePath || ambulancePath.length === 0) {
            console.warn("Ambulance path could not be generated.");
            return;
        }
        this.ambulance = new Ambulance(this.sceneSetup.scene, this.sceneSetup.camera, ambulancePath);

        // Initial Cinematic Camera Setup (if active)
        if (this.cinematicCamera.active && this.ambulance && this.ambulance.path.length > 0) {
            // Ensure ambulance has its initial orientation before getting direction
            if (this.ambulance.path.length > 1) {
                 this.ambulance.group.lookAt(this.ambulance.path[1].x, this.ambulance.group.position.y, this.ambulance.path[1].z);
            }

            const ambPos = this.ambulance.getPosition();
            const ambDir = this.ambulance.getDirection(); 
            
            const offset = Config.cameraFollowOffset || { x: 0, y: 3.5, z: -7 };
            const cameraPos = new THREE.Vector3().copy(ambPos)
                .addScaledVector(ambDir, offset.z) 
                .add(new THREE.Vector3(0, offset.y, 0)); 

            this.sceneSetup.camera.position.copy(cameraPos);
            this.cinematicCamera.targetPosition.copy(cameraPos);
            
            const lookAtOffset = Config.cameraLookAtOffsetAmbulance || { x: 0, y: 1.2, z: 6 };
            const lookAtTarget = new THREE.Vector3().copy(ambPos)
                .addScaledVector(ambDir, lookAtOffset.z) 
                .add(new THREE.Vector3(0, lookAtOffset.y, 0)); 

            this.cinematicCamera.targetLookAt.copy(lookAtTarget);
            this.cinematicCamera.currentLookAtSmooth.copy(lookAtTarget); 
            this.sceneSetup.camera.lookAt(lookAtTarget);
            console.log("Initial cinematic camera setup for ambulance.");
        }
        
        // Activate ambulance after a delay
        setTimeout(() => { if (this.ambulance && this.ambulance.activate) this.ambulance.activate(); }, 2000); // Start after 2 seconds
    }

   updateAmbulanceLogic() {
        if (!this.ambulance || !this.ambulance.model || !this.ambulance.path || this.ambulance.path.length === 0) return;
        if (this.ambulance.currentPathIndex >= this.ambulance.path.length) return;

        const ambulancePos = this.ambulance.getPosition();
        const preemptionRadius = Config.ambulancePreemptionRadius || 150; // Using the new default

        this.junctions.forEach(junction => {
            if (junction.hasAmbulancePassed) return;

            const distanceToJunctionCenter = ambulancePos.distanceTo(junction.center);
            
            let ambulanceMovingTowardsJunction = false;
            if (this.ambulance.path.length > this.ambulance.currentPathIndex) {
                const currentAmbulanceTargetX = this.ambulance.path[this.ambulance.currentPathIndex].x;
                if ((currentAmbulanceTargetX - junction.center.x) * (ambulancePos.x - junction.center.x) <= 0) { 
                    ambulanceMovingTowardsJunction = true;
                } else if (Math.sign(currentAmbulanceTargetX - ambulancePos.x) === Math.sign(junction.center.x - ambulancePos.x) &&
                           Math.abs(junction.center.x - ambulancePos.x) < Math.abs(currentAmbulanceTargetX - ambulancePos.x) ){
                     ambulanceMovingTowardsJunction = true;
                }
            }
            if (distanceToJunctionCenter < Config.junctionSize * 1.5) ambulanceMovingTowardsJunction = true;


            // Preemption Logic based on radius
            if (!junction.isAmbulanceApproaching && ambulanceMovingTowardsJunction && distanceToJunctionCenter < preemptionRadius) {
                console.log(`Junction ${junction.id}: Ambulance in preemption zone (${distanceToJunctionCenter.toFixed(1)}m). Setting TL priority.`);
                this.controlTrafficLightsForJunction(junction.id, true);
                junction.isAmbulanceApproaching = true; // Critical: set this before generating status text
                junction.isUnderNormalCycle = false;
                // MODIFIED UI TEXT
                let statusText = `J${junction.id}: Preempting (Zone)`;
                if (junction.reflectorChain.length > 0) { // Check if reflectors were already active
                    statusText = `J${junction.id}: Preempting (Zone & Reflectors Active)`;
                }
                if(document.getElementById('ambulanceStatus')) document.getElementById('ambulanceStatus').textContent = statusText;
            }

            // Reflector Activation Logic
            if (junction.reflectors.length > 0 && ambulanceMovingTowardsJunction) {
                for (const reflector of junction.reflectors) {
                    if (junction.reflectorChain.includes(reflector)) continue; 
                    
                    if (reflector.canDetectAmbulance(ambulancePos) || 
                        (junction.reflectorChain.length > 0 && reflector.isAmbulanceNear(junction.reflectorChain[junction.reflectorChain.length-1].group.position))) {
                        
                        if (!junction.reflectorChain.includes(reflector)) {
                            reflector.triggerSignal();
                            junction.reflectorChain.push(reflector); // Reflector chain is now populated
                        }
                        
                        if (!junction.isAmbulanceApproaching) { // Reflector detection is the FIRST trigger for this junction
                            console.log(`Junction ${junction.id}: Ambulance detected by FIRST reflector. Setting TL priority.`);
                            this.controlTrafficLightsForJunction(junction.id, true);
                            junction.isAmbulanceApproaching = true; // Critical: set this before generating status text
                            junction.isUnderNormalCycle = false;
                            // MODIFIED UI TEXT - Reflectors are active by definition here
                            if(document.getElementById('ambulanceStatus')) document.getElementById('ambulanceStatus').textContent = `J${junction.id}: Preempting (Reflectors Active)`;
                        } else {
                            // Ambulance already approaching (e.g. by radius), now reflectors also confirm for THIS junction.
                            // Update UI if it doesn't already mention reflectors for this specific junction.
                            const statusEl = document.getElementById('ambulanceStatus');
                            if (statusEl) {
                                const currentText = statusEl.textContent;
                                // If UI is showing preemption for THIS junction by radius, and reflector status isn't there, add it.
                                if (currentText === `J${junction.id}: Preempting (Zone)`) {
                                    statusEl.textContent = `J${junction.id}: Preempting (Zone & Reflectors Active)`;
                                }
                                // If currentText already includes "Reflectors Active" or is for another junction, no change from here.
                            }
                        }
                        break; 
                    }
                }
            }
            
            // Logic for when ambulance has passed a junction (UI text for "Passed" remains unchanged)
            const ambulanceDirectionX = (this.ambulance.path.length > 1 && this.ambulance.currentPathIndex < this.ambulance.path.length -1) ? 
                                      Math.sign(this.ambulance.path[this.ambulance.currentPathIndex+1].x - ambulancePos.x) : 
                                      ((this.ambulance.path.length > 0 && this.ambulance.currentPathIndex < this.ambulance.path.length) ? 
                                       Math.sign(this.ambulance.path[this.ambulance.currentPathIndex].x - ambulancePos.x) : 0);

            const passedJunctionThreshold = Config.junctionSize / 2 + Config.roadWidth; 
            if (junction.isAmbulanceApproaching) { 
                 let hasPhysicallyPassedJunction = false;
                 if (ambulanceDirectionX > 0 ) { 
                    hasPhysicallyPassedJunction = ambulancePos.x > (junction.center.x + passedJunctionThreshold);
                 } else if (ambulanceDirectionX < 0) { 
                    hasPhysicallyPassedJunction = ambulancePos.x < (junction.center.x - passedJunctionThreshold);
                 }

                if (hasPhysicallyPassedJunction) {
                    let targetIsPastJunction = false;
                    const currentTargetPathPoint = this.ambulance.path[this.ambulance.currentPathIndex];
                    if(currentTargetPathPoint){
                        if((ambulanceDirectionX > 0) && currentTargetPathPoint.x > junction.center.x + passedJunctionThreshold) targetIsPastJunction = true;
                        if((ambulanceDirectionX < 0) && currentTargetPathPoint.x < junction.center.x - passedJunctionThreshold) targetIsPastJunction = true;
                        if(this.ambulance.currentPathIndex === this.ambulance.path.length -1) targetIsPastJunction = true; 
                    } else if (this.ambulance.currentPathIndex >= this.ambulance.path.length -1) { 
                        targetIsPastJunction = true;
                    }

                    if (targetIsPastJunction) {
                        console.log(`Ambulance has passed Junction ${junction.id}. Releasing traffic lights.`);
                        this.controlTrafficLightsForJunction(junction.id, false); 
                        junction.isAmbulanceApproaching = false;
                        junction.hasAmbulancePassed = true; 
                        junction.reflectorChain = []; 
                        junction.isUnderNormalCycle = true; 
                         if(document.getElementById('ambulanceStatus')) document.getElementById('ambulanceStatus').textContent = `J${junction.id}: Passed`;
                    }
                }
            }
        });
    }
    
    controlTrafficLightsForJunction(junctionId, givePriorityToAmbulance) {
        const junction = this.junctions.find(j => j.id === junctionId);
        if (!junction) return;
    
        // Assuming specific traffic light order based on setupEnvironment:
        // TL0: South-Bound (approaching from N, on SW corner, faces N)
        // TL1: North-Bound (approaching from S, on NE corner, faces S)
        // TL2: West-Bound  (approaching from E, on NW corner, faces E) - Main ambulance E-W path
        // TL3: East-Bound  (approaching from W, on SE corner, faces W) - Main ambulance E-W path
        
        const southBoundLight = junction.trafficLights[0]; 
        const northBoundLight = junction.trafficLights[1]; 
        const westBoundLight = junction.trafficLights[2];  // Ambulance travels West -> East, this light controls traffic from East.
        const eastBoundLight = junction.trafficLights[3];  // Ambulance travels West -> East, this light controls traffic from West.
    
        if (givePriorityToAmbulance) {
            junction.isUnderNormalCycle = false; 
            // For an ambulance assumed to be travelling West-to-East:
            // East-bound traffic (controlled by TL3) should get GREEN.
            // West-bound traffic (controlled by TL2) should also get GREEN.
            // North-bound (TL1) and South-bound (TL0) traffic should get RED.
             if (eastBoundLight) eastBoundLight.setPriority(true);   // Green for ambulance's path
             if (westBoundLight) westBoundLight.setPriority(true);  // Green for ambulance's path (opposite direction)
             if (northBoundLight) northBoundLight.setPriority(false); // Red for conflicting N-S
             if (southBoundLight) southBoundLight.setPriority(false); // Red for conflicting N-S
        } else { 
            junction.trafficLights.forEach(tl => {
                if (tl) tl.releasePriority(); // TrafficLight handles its own safe state on release
            });
            junction.isUnderNormalCycle = true; 
            
            // Reset to a safe phase (e.g., ALL_RED) before resuming normal cycle
            let initialPhaseIndex = JUNCTION_CYCLE_DEFINITION.findIndex(p => p.phase === JUNCTION_PHASES.ALL_RED);
            if (initialPhaseIndex === -1) initialPhaseIndex = 0; // Fallback if ALL_RED is not defined
            
            junction.currentPhaseIndex = initialPhaseIndex;
            junction.currentPhaseTimer = (JUNCTION_CYCLE_DEFINITION[junction.currentPhaseIndex].duration || 1000) / 1000;
            this.applyJunctionPhaseState(junction, true); // Apply silently
        }
    }
    
    manageJunctionCycles(deltaTime) {
        this.junctions.forEach(junction => {
            if (junction.isUnderNormalCycle && junction.trafficLights.length > 0) {
                junction.currentPhaseTimer -= deltaTime;

                if (junction.currentPhaseTimer <= 0) {
                    junction.currentPhaseIndex = (junction.currentPhaseIndex + 1) % JUNCTION_CYCLE_DEFINITION.length;
                    const nextPhase = JUNCTION_CYCLE_DEFINITION[junction.currentPhaseIndex];
                    junction.currentPhaseTimer = (nextPhase.duration || 1000) / 1000; // Reset timer for new phase
                    this.applyJunctionPhaseState(junction);
                }
            }
        });
    }

    applyJunctionPhaseState(junction, silent = false) {
        if (!junction || !junction.trafficLights || junction.trafficLights.length < 4) {
            console.warn(`Cannot apply phase state to junction ${junction?.id}: missing data.`);
            return;
        }
        const currentPhaseName = JUNCTION_CYCLE_DEFINITION[junction.currentPhaseIndex].phase;
        const LIGHT_STATE = TrafficLight.LIGHT_STATE; 
        
        // Helper to set light state, respects overrides unless forced
        const setLight = (light, state) => light?.setLightState(state, false, silent); // isPriority=false, forceSilent for initial setup

        // Default all to RED, then set GREEN/YELLOW as per phase
        // Order: TL0 (S-Bound), TL1 (N-Bound), TL2 (W-Bound from E), TL3 (E-Bound from W)
        setLight(junction.trafficLights[0], LIGHT_STATE.RED); 
        setLight(junction.trafficLights[1], LIGHT_STATE.RED); 
        setLight(junction.trafficLights[2], LIGHT_STATE.RED); 
        setLight(junction.trafficLights[3], LIGHT_STATE.RED); 

        switch (currentPhaseName) {
            case JUNCTION_PHASES.EW_GREEN: // East-West Green
                setLight(junction.trafficLights[3], LIGHT_STATE.GREEN); // E-Bound (traffic from West)
                setLight(junction.trafficLights[2], LIGHT_STATE.GREEN); // W-Bound (traffic from East)
                break;
            case JUNCTION_PHASES.EW_YELLOW: // East-West Yellow
                setLight(junction.trafficLights[3], LIGHT_STATE.YELLOW);
                setLight(junction.trafficLights[2], LIGHT_STATE.YELLOW);
                break;
            case JUNCTION_PHASES.NS_GREEN: // North-South Green
                setLight(junction.trafficLights[1], LIGHT_STATE.GREEN); // N-Bound (traffic from South)
                setLight(junction.trafficLights[0], LIGHT_STATE.GREEN); // S-Bound (traffic from North)
                break;
            case JUNCTION_PHASES.NS_YELLOW: // North-South Yellow
                setLight(junction.trafficLights[1], LIGHT_STATE.YELLOW);
                setLight(junction.trafficLights[0], LIGHT_STATE.YELLOW);
                break;
            case JUNCTION_PHASES.ALL_RED:
                // All lights already set to RED by default above
                break;
        }
    }

    updateCarLogic(deltaTime, ambulance) {
        const ambulanceActive = ambulance && ambulance.model && ambulance.path && ambulance.currentPathIndex < ambulance.path.length && !ambulance.isDeactivating && !ambulance.hasFadedOut;
        let ambulancePos = null;
        let ambulanceLaneZ = Config.ambulanceLaneOffsetZ ?? -(Config.roadWidth / 4);
        let ambulanceIsVeryCloseAndNeedsWay = false;

        if (ambulanceActive) {
            ambulancePos = ambulance.getPosition();
            if (ambulance.path[ambulance.currentPathIndex]) {
                 ambulanceLaneZ = ambulance.path[ambulance.currentPathIndex].z; // Get ambulance's current target lane Z
            }
        }

        this.proceduralCars.forEach(car => {
            let relevantJunctionData = null;
            let relevantTrafficLight = null;
            const carSpeedSign = Math.sign(car.speed); // Determines car's general direction (+1 East, -1 West)

            // Find relevant junction and traffic light for the car
            if (this.road && this.road.junctionCenters && this.junctions) {
                for (const j_data of this.junctions) { 
                    if(!j_data || !j_data.center) continue;
                    // Distance to junction center along car's direction of travel
                    const distToJunctionX = (j_data.center.x - car.group.position.x) * carSpeedSign;
                    
                    // If junction is ahead and within detection range
                    if (distToJunctionX > -car.length && distToJunctionX < Config.carDetectionDistanceToJunction + 5) {
                        if (j_data.trafficLights && j_data.trafficLights.length >=4){
                            // TL3 for Eastbound (carSpeedSign > 0), TL2 for Westbound (carSpeedSign < 0)
                            relevantTrafficLight = (carSpeedSign > 0) ? j_data.trafficLights[3] : j_data.trafficLights[2];
                            if(relevantTrafficLight) relevantJunctionData = j_data;
                        }
                        break; // Car only considers one upcoming junction at a time
                    }
                }
            }
            
            ambulanceIsVeryCloseAndNeedsWay = false;
            if (ambulanceActive && ambulancePos) {
                const dX = car.group.position.x - ambulancePos.x; // Positive if car is east of ambulance
                const dZ = Math.abs(car.group.position.z - ambulancePos.z);
                // If ambulance is very close behind or alongside the car
                if (dX > -Config.carEvadeDistance / 2 && dX < car.length * 2 && dZ < Config.laneWidth * 1.5) {
                    ambulanceIsVeryCloseAndNeedsWay = true;
                }
            }

            if (relevantJunctionData && relevantTrafficLight) {
                 car.checkAndHandleTrafficLight(relevantJunctionData, relevantTrafficLight, ambulanceIsVeryCloseAndNeedsWay);
            } else {
                car.isStoppedForLight = false; // No relevant light, so not stopped for one
            }

            car.update(deltaTime); 

            if (ambulanceActive && ambulancePos) {
                const dX = car.group.position.x - ambulancePos.x; // Positive if car is East of ambulance
                const carIsGenerallyAheadOrOverlap = (car.speed > 0 && dX > -car.length * 1.5) || (car.speed < 0 && dX < car.length * 1.5);
                const inProximityXForEvasion = Math.abs(dX) < Config.carEvadeDistance;

                if (carIsGenerallyAheadOrOverlap && inProximityXForEvasion) { // If car is ahead of or overlapping with ambulance and within evasion X range
                    if (!car.isEvading) car.startEvade(ambulanceLaneZ); // ambulanceLaneZ is target Z of ambulance path
                    // If car is evading AND stopped for light, but ambulance is very close, it might need to inch forward
                    if (car.isEvading && car.isStoppedForLight && ambulanceIsVeryCloseAndNeedsWay) {
                        car.isStoppedForLight = false; 
                        car.currentSpeed = car.speed * 0.25; // Creep forward slowly
                    }
                } else { // Ambulance is far away or car is well behind it
                    if (car.isEvading) car.stopEvade();
                }
            } else { // Ambulance not active
                if (car.isEvading) car.stopEvade();
                if (!car.isStoppedForLight && Math.abs(car.currentSpeed) < Math.abs(car.speed)) { // Resume normal speed if not stopped and was slow
                    car.currentSpeed = car.speed;
                }
            }
        });
    }
    
    updatePedestrianLogic(deltaTime) {
         this.proceduralPedestrians.forEach(p => {
            p.update(deltaTime);
        });
    }

    updateCinematicCamera(deltaTime) {
        if (!this.ambulance || !this.ambulance.model || this.ambulance.hasFadedOut) {
            if (this.sceneSetup.controls && !this.sceneSetup.controls.enabled && this.cinematicCamera.active) {
                this.sceneSetup.controls.enabled = true; // Re-enable orbit controls if ambulance is gone
            }
            return; 
        }
        if (this.sceneSetup.controls) this.sceneSetup.controls.enabled = false; // Disable orbit controls

        const ambPos = this.ambulance.getPosition();
        const ambDir = this.ambulance.getDirection().normalize(); 
        const lerpFactor = Math.min(1.0, (Config.cameraLerpFactor ?? 0.05) * (deltaTime * 60)); // Frame-rate independent lerp

        // Target camera position based on ambulance and offset
        const camOffset = Config.cameraFollowOffset || {x:0, y:4.0, z:-9};
        this.cinematicCamera.targetPosition.copy(ambPos)
            .addScaledVector(ambDir, camOffset.z); // Move back along ambulance direction
            
        // Handle X offset relative to ambulance's side (using cross product for right vector)
        if (Math.abs(camOffset.x) > 0.01) {
            const camUp = this.sceneSetup.camera.up; // Use current camera up vector
            const rightDir = new THREE.Vector3().crossVectors(ambDir, camUp).normalize(); // ambDir X camUp gives left, so use ambDir X camUp then negate, or camUp X ambDir
            if (rightDir.lengthSq() > 0.001) { // Ensure cross product didn't result in zero vector
                this.cinematicCamera.targetPosition.addScaledVector(rightDir, camOffset.x);
            }
        }
        this.cinematicCamera.targetPosition.y += camOffset.y; // Apply Y offset directly


        // Target look-at point
        const lookAtOffset = Config.cameraLookAtOffsetAmbulance || {x:0, y:1.3, z:5};
        this.cinematicCamera.targetLookAt.copy(ambPos)
            .addScaledVector(ambDir, lookAtOffset.z) 
            .add(new THREE.Vector3(0, lookAtOffset.y, 0)); // Look slightly above ambulance base, and ahead

        // Smoothly interpolate camera position and look-at target
        this.sceneSetup.camera.position.lerp(this.cinematicCamera.targetPosition, lerpFactor);
        this.cinematicCamera.currentLookAtSmooth.lerp(this.cinematicCamera.targetLookAt, lerpFactor);
        this.sceneSetup.camera.lookAt(this.cinematicCamera.currentLookAtSmooth);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        const deltaTime = Math.min(this.clock.getDelta(), 0.05); // Cap delta time to prevent large jumps

        if (this.ambulance) {
            this.ambulance.update(deltaTime); 
            if (this.ambulance.hasFadedOut) {
                // Clean up ambulance if it has completely faded
                if (this.ambulance.group.parent) this.sceneSetup.remove(this.ambulance.group);
                this.ambulance = null; 
                if(this.cinematicCamera.active && this.sceneSetup.controls) {
                    this.sceneSetup.controls.enabled = true; // Re-enable controls
                }
                const ambulanceStatusEl = document.getElementById('ambulanceStatus');
                if(ambulanceStatusEl) ambulanceStatusEl.textContent = 'Departed';
            } else {
                this.updateAmbulanceLogic(); // Only update logic if ambulance exists and hasn't faded
            }
        }
        
        this.manageJunctionCycles(deltaTime); 
        this.updateCarLogic(deltaTime, this.ambulance); // Pass ambulance for car interaction
        this.updatePedestrianLogic(deltaTime);

        // Update cinematic camera if active and ambulance is present
        if (this.cinematicCamera.active && this.ambulance && !this.ambulance.hasFadedOut) {
            this.updateCinematicCamera(deltaTime);
        } else if (this.cinematicCamera.active && (!this.ambulance || this.ambulance.hasFadedOut)) {
             // If cinematic camera was active but ambulance is now gone, ensure orbit controls are enabled
             if (this.sceneSetup.controls && !this.sceneSetup.controls.enabled) {
                this.sceneSetup.controls.enabled = true;
            }
        }
        this.sceneSetup.render();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded. Initializing Simulation...");
    // A small delay can sometimes help ensure all resources (like canvas) are fully ready.
    setTimeout(() => {
        new Simulation();
    }, 100); 
});