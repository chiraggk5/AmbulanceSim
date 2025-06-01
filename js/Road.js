// js/Road.js
import * as THREE from 'three';
import { Config } from './Config.js';

export class Road {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.junctionCenters = [];
        this.textureLoader = new THREE.TextureLoader();

        const safeRoadSurfaceY = Config.roadSurfaceY ?? 0;
        this.roadSurfaceY = safeRoadSurfaceY;

        this.roadTexture = this.loadTextureWithFallback('assets/textures/asphalt_road_01.png', Config.colors.road);
        this.footpathTexture = this.loadTextureWithFallback('assets/textures/footpath_concrete.jpg', 0xBBBBBB);
        this.laneMarkingMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0x111111, roughness: 0.8 });
        this.curbMaterial = new THREE.MeshStandardMaterial({ color: 0x606060, roughness: 0.9 });

        this.createRoadLayout();
        this.scene.add(this.group);
    }

    loadTextureWithFallback(path, fallbackColorHex) {
        try {
            const texture = this.textureLoader.load(path,
                (tex) => { // onLoad
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    if(this.scene.userData.renderer && this.scene.userData.renderer.capabilities) { // For Anisotropy
                        tex.anisotropy = this.scene.userData.renderer.capabilities.getMaxAnisotropy();
                    }
                    tex.needsUpdate = true;
                },
                undefined, // onProgress
                (err) => { 
                    console.warn(`Failed to load texture ${path}. Fallback material may apply.`, err);
                }
            );
            return texture; 
        } catch (e) {
            console.warn(`Error initiating texture load for ${path}.`, e);
            return null;
        }
    }

    createRoadSurfaceMaterial(length, width) {
        const material = new THREE.MeshStandardMaterial({
            side: THREE.DoubleSide, // In case camera goes below
            color: Config.colors.road,
            roughness: 0.8,
            metalness: 0.1
        });
        if (this.roadTexture && this.roadTexture.image) { // Check if texture image actually loaded
            material.map = this.roadTexture.clone(); 
            material.map.needsUpdate = true; 
            material.map.repeat.set(length / 10, width / 10); 
            material.color.set(0xffffff); // Set to white if texture is used, so texture colors show properly
        }
        return material;
    }

    createFootpathMaterial(length, width) {
        const material = new THREE.MeshStandardMaterial({
            side: THREE.DoubleSide,
            color: 0xBBBBBB, 
            roughness: 0.85,
            metalness: 0.1
        });
        if (this.footpathTexture && this.footpathTexture.image) {
            material.map = this.footpathTexture.clone();
            material.map.needsUpdate = true;
            material.map.repeat.set(length / 2, width / 1); 
            material.color.set(0xffffff);
        }
        return material;
    }


    createRoadSegment(length, width, position, rotationY = 0, isJunctionCenterSquare = false) {
        const segmentGroup = new THREE.Group();
        segmentGroup.position.copy(position);
        segmentGroup.rotation.y = rotationY;

        // Main road plane slightly lower to allow markings/details on top without Z-fighting
        const roadPlaneY = this.roadSurfaceY - 0.051; 

        // Road Surface
        const roadSurfaceGeo = new THREE.PlaneGeometry(length, width);
        const roadSurfaceMat = this.createRoadSurfaceMaterial(length, width);
        const roadSurface = new THREE.Mesh(roadSurfaceGeo, roadSurfaceMat);
        roadSurface.receiveShadow = true;
        roadSurface.rotation.x = -Math.PI / 2;
        roadSurface.position.y = roadPlaneY;
        segmentGroup.add(roadSurface);

        // Footpath and curb details (not for the central junction square)
        if (!isJunctionCenterSquare) {
            const curbHeight = 0.15; 
            const footpathActualWidth = Config.footpathWidth ?? 1.5;
            const curbSeparationWidth = 0.1; // Small gap or width of the curb itself
            // Footpath surface Y, considering offset from main road surface
            const footpathSurfaceY = this.roadSurfaceY + (Config.footpathHeightOffset ?? 0.05) - 0.05; // Plane slightly lower for details

            // Inner Curb (between road and footpath)
            const curbInnerGeo = new THREE.BoxGeometry(length, curbHeight, curbSeparationWidth);
            
            const curbLeftInner = new THREE.Mesh(curbInnerGeo, this.curbMaterial);
            curbLeftInner.position.set(0, roadPlaneY + curbHeight / 2, width / 2 - curbSeparationWidth / 2); // On positive Z side of road
            curbLeftInner.castShadow = true;
            segmentGroup.add(curbLeftInner);

            const curbRightInner = new THREE.Mesh(curbInnerGeo, this.curbMaterial);
            curbRightInner.position.set(0, roadPlaneY + curbHeight / 2, -width / 2 + curbSeparationWidth / 2); // On negative Z side
            curbRightInner.castShadow = true;
            segmentGroup.add(curbRightInner);

            // Footpath Plane
            const footpathGeo = new THREE.PlaneGeometry(length, footpathActualWidth);
            const footpathMat = this.createFootpathMaterial(length, footpathActualWidth);

            const footpathLeft = new THREE.Mesh(footpathGeo, footpathMat);
            footpathLeft.rotation.x = -Math.PI / 2;
            footpathLeft.position.set(0, footpathSurfaceY, width / 2 + curbSeparationWidth + footpathActualWidth / 2); // Outer side of curb
            footpathLeft.receiveShadow = true;
            segmentGroup.add(footpathLeft);

            const footpathRight = new THREE.Mesh(footpathGeo, footpathMat);
            footpathRight.rotation.x = -Math.PI / 2;
            footpathRight.position.set(0, footpathSurfaceY, -(width / 2 + curbSeparationWidth + footpathActualWidth / 2));
            footpathRight.receiveShadow = true;
            segmentGroup.add(footpathRight);


            // Lane Markings (dashed center line)
            const numLanesTotal = Math.floor(width / (Config.laneWidth || 3.5)); // Total lanes based on road width
            if (numLanesTotal >= 2) { // Only draw if at least 2 lanes (implying a center)
                const markingLength = 2.5;
                const markingGap = 2.5;
                const markingVisualWidth = 0.12; // Thickness of the painted line
                const markingHeight = 0.005; // Very thin, effectively a decal on the road surface
                const markingGeo = new THREE.BoxGeometry(markingLength, markingHeight, markingVisualWidth);

                // Assuming a single dashed line in the center if more than 1 lane in one direction (e.g. 2 lanes total one way, or 1 lane each way)
                const numMarkings = Math.floor(length / (markingLength + markingGap));
                for (let i = 0; i < numMarkings; i++) {
                    const marking = new THREE.Mesh(markingGeo, this.laneMarkingMaterial);
                    // Position markings along the center of the road segment
                    marking.position.set(-length / 2 + i * (markingLength + markingGap) + markingLength / 2, this.roadSurfaceY - 0.045, 0);
                    // marking.castShadow = false; // Markings usually don't cast significant shadows
                    // marking.receiveShadow = true; // Can receive shadows from cars etc.
                    segmentGroup.add(marking);
                }
            }
        }
        return segmentGroup;
    }

    createRoadLayout() {
        const ewRoadLength = Config.roadLength;
        const ewRoadWidth = Config.roadWidth;
        const junctionSize = Config.junctionSize; // This is the side length of the square junction area
        const numJunctions = Config.numJunctions;

        const totalLengthOverall = (numJunctions + 1) * ewRoadLength + numJunctions * junctionSize;
        let currentX = -totalLengthOverall / 2; // Start from the far west

        // Create East-West road segments and junctions
        for (let i = 0; i <= numJunctions; i++) {
            // Add a straight E-W road segment first
            const segment = this.createRoadSegment(ewRoadLength, ewRoadWidth, new THREE.Vector3(currentX + ewRoadLength / 2, 0, 0));
            this.group.add(segment);
            currentX += ewRoadLength;

            if (i < numJunctions) { // If not the last segment, add a junction after it
                const junctionCenterX = currentX + junctionSize / 2;
                const junctionCenterZ = 0; // Assuming E-W road is along Z=0
                this.junctionCenters.push(new THREE.Vector3(junctionCenterX, this.roadSurfaceY, junctionCenterZ));

                // Junction square (the main intersection area)
                const junctionSquare = this.createRoadSegment(junctionSize, junctionSize, 
                    new THREE.Vector3(junctionCenterX, 0, junctionCenterZ), 0, true); // Mark as junction square
                this.group.add(junctionSquare);

                // N-S Roads connected to this junction
                const nsRoadLength = Config.roadLength; // Length of the N-S arms extending from junction
                const nsRoadWidth = Config.roadWidth;

                // South arm (extends downwards from junction)
                const southArm = this.createRoadSegment(nsRoadLength, nsRoadWidth,
                    new THREE.Vector3(junctionCenterX, 0, junctionCenterZ - junctionSize / 2 - nsRoadLength / 2), Math.PI / 2);
                this.group.add(southArm);

                // North arm (extends upwards from junction)
                const northArm = this.createRoadSegment(nsRoadLength, nsRoadWidth,
                    new THREE.Vector3(junctionCenterX, 0, junctionCenterZ + junctionSize / 2 + nsRoadLength / 2), Math.PI / 2);
                this.group.add(northArm);
                
                currentX += junctionSize; // Move past the junction for the next E-W segment
            }
        }
        this.junctionCenters.sort((a, b) => a.x - b.x); // Ensure sorted by X for pathfinding
        console.log("Junction centers:", this.junctionCenters.map(jc => `(${jc.x.toFixed(1)}, ${jc.z.toFixed(1)})`));
    }

    getAmbulancePath() {
        const path = [];
        // Ambulance Y position, slightly above road surface to avoid Z-fighting with markings.
        // This depends on your ambulance model's pivot point. If pivot is at base, this is good.
        const ambulanceY = this.roadSurfaceY + 0.2; 
        
        const totalRoadLengthEW = (Config.numJunctions + 1) * Config.roadLength + Config.numJunctions * Config.junctionSize;
        const startX = -totalRoadLengthEW / 2 - Config.roadLength * 0.2; // Start west of the first segment
        const endX = totalRoadLengthEW / 2 + Config.roadLength * 0.2;   // End east of the last segment

        // Z offset for the ambulance path from the center of the road (e.g., a specific lane)
        const ambulanceLaneZ = Config.ambulanceLaneOffsetZ ?? -(Config.roadWidth / 4); // Default to a lane if not specified

        path.push(new THREE.Vector3(startX, ambulanceY, ambulanceLaneZ)); // Starting point

        // Add waypoints through each junction
        if (this.junctionCenters.length > 0) {
            this.junctionCenters.forEach(center => {
                // Points to make smoother turns or ensure it passes through critical areas
                path.push(new THREE.Vector3(center.x - Config.junctionSize, ambulanceY, ambulanceLaneZ)); // Approach point before junction
                path.push(new THREE.Vector3(center.x, ambulanceY, ambulanceLaneZ));                     // Middle of junction
                path.push(new THREE.Vector3(center.x + Config.junctionSize, ambulanceY, ambulanceLaneZ)); // Exit point after junction
            });
        } else { // Straight path if no junctions defined in Config
            path.push(new THREE.Vector3(0, ambulanceY, ambulanceLaneZ)); // Add a midpoint for a simple straight road
        }

        path.push(new THREE.Vector3(endX, ambulanceY, ambulanceLaneZ)); // Ending point

        // Filter out consecutive duplicate points which can cause issues with lookAt calculations
        const uniquePath = path.filter((point, i, arr) => i === 0 || !point.equals(arr[i-1]));
        console.log("Ambulance Path (Lane Z: " + ambulanceLaneZ + "):", uniquePath.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})`));
        return uniquePath;
    }

    getReflectorPositions(junctionIndex, approachDirection = 'west') {
        if (junctionIndex < 0 || junctionIndex >= this.junctionCenters.length) {
            console.warn(`getReflectorPositions: Invalid junctionIndex ${junctionIndex}`);
            return [];
        }
        const junctionCenter = this.junctionCenters[junctionIndex];
        if (!junctionCenter) {
            console.warn(`getReflectorPositions: No center found for junctionIndex ${junctionIndex}`);
            return [];
        }

        const positions = [];
        // Y position for reflector base, slightly above road surface (e.g. on top of lane marking)
        const reflectorYPosition = this.roadSurfaceY - 0.0425; // Align with lane marking top

        const roadSegmentLength = Config.roadLength; // Length of the road segment leading to junction
        const reflectorSpacing = Config.reflectorSpacing;
        const numReflectors = Math.floor(roadSegmentLength / reflectorSpacing);

        // Reflectors typically on the center lane marking (Z=0 relative to E-W road segment)
        const reflectorLocalZ = 0; 

        if (approachDirection === 'west') { 
            // Reflectors on E-W road segment leading TO the junction from the West
            // This segment starts after the *previous* junction (or map edge) and ends at `junctionCenter.x - junctionSize/2`
            const segmentStartX = junctionCenter.x - Config.junctionSize / 2 - roadSegmentLength;

            for (let i = 0; i < numReflectors; i++) {
                positions.push(new THREE.Vector3(
                    segmentStartX + (i + 0.5) * reflectorSpacing, // Place along the segment
                    reflectorYPosition,
                    junctionCenter.z + reflectorLocalZ // Align with E-W road's Z center
                ));
            }
            // For West approach (ambulance moving +X), reflectors should activate in reverse order of placement if chained
            return positions.reverse(); 
        
        } else if (approachDirection === 'east') {
            // Reflectors on E-W road segment leading TO junction from East
            const segmentStartX = junctionCenter.x + Config.junctionSize / 2; // Starts after current junction, extends East
             for (let i = 0; i < numReflectors; i++) {
                positions.push(new THREE.Vector3(
                    segmentStartX + (i + 0.5) * reflectorSpacing,
                    reflectorYPosition,
                    junctionCenter.z + reflectorLocalZ
                ));
            }
            return positions; // Order is correct for ambulance approaching from East (moving -X)

        } else if (approachDirection === 'south') {
            // Reflectors on N-S road segment leading TO junction from South
            const segmentStartZ = junctionCenter.z - Config.junctionSize / 2 - roadSegmentLength;
            for (let i = 0; i < numReflectors; i++) {
                positions.push(new THREE.Vector3(
                    junctionCenter.x + reflectorLocalZ, // Reflectors on N-S road's X-centerline
                    reflectorYPosition,
                    segmentStartZ + (i + 0.5) * reflectorSpacing 
                ));
            }
            return positions.reverse(); // For ambulance approaching from South (moving +Z)

        } else if (approachDirection === 'north') {
            // Reflectors on N-S road segment leading TO junction from North
            const segmentStartZ = junctionCenter.z + Config.junctionSize / 2;
             for (let i = 0; i < numReflectors; i++) {
                positions.push(new THREE.Vector3(
                    junctionCenter.x + reflectorLocalZ,
                    reflectorYPosition,
                    segmentStartZ + (i + 0.5) * reflectorSpacing
                ));
            }
            return positions; // For ambulance approaching from North (moving -Z)
        }
        return positions; // Should not be reached if valid direction
    }

    getJunctionCenter(junctionIndex) {
        if (junctionIndex >= 0 && junctionIndex < this.junctionCenters.length) {
            return this.junctionCenters[junctionIndex];
        }
        console.warn(`Requested junction center for invalid index: ${junctionIndex}`);
        return null;
    }
}