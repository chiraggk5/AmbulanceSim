// js/ProceduralBuilding.js
import * as THREE from 'three';
// import { Config } from './Config.js'; // Not strictly needed here unless for specific building configs

export class ProceduralBuilding {
    constructor(scene, position, baseWidth = 10, baseDepth = 10, maxHeight = 30, theme = 'modern') {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.position.copy(position); // Sets the base position of the building (center of its footprint)

        this.textureLoader = new THREE.TextureLoader();
        this.wallTexturePath = 'assets/textures/building_wall_01.png';
        this.windowTexturePath = 'assets/textures/building_window_01.jpg';
        this.roofTexturePath = 'assets/textures/building_roof_01.png';
        this.doorTexturePath = 'assets/textures/door_01.png';

        this.wallTexture = this.loadTexture(this.wallTexturePath);
        this.windowTexture = this.loadTexture(this.windowTexturePath);
        this.roofTexture = this.loadTexture(this.roofTexturePath);
        this.doorTexture = this.loadTexture(this.doorTexturePath);


        this.generateBuilding(baseWidth, baseDepth, maxHeight, theme);
        this.scene.add(this.group);
    }

    loadTexture(path, repeatX = 1, repeatY = 1, aniso = 4) {
        try {
            const texture = this.textureLoader.load(path, (tex) => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(repeatX, repeatY);
                // Access renderer from scene.userData if set by main.js for anisotropy
                if(this.scene.userData.renderer && this.scene.userData.renderer.capabilities) {
                     tex.anisotropy = this.scene.userData.renderer.capabilities.getMaxAnisotropy();
                } else {
                    tex.anisotropy = aniso; // Fallback
                }
                tex.needsUpdate = true;
            }, undefined, (err) => {
                console.warn(`Building Texture Load Error: ${path}`, err);
            });
            return texture;
        } catch (e) {
            console.warn(`Building Texture Init Error: ${path}`, e);
            return null;
        }
    }

    generateBuilding(baseWidth, baseDepth, maxHeight, theme) {
        const buildingHeight = THREE.MathUtils.randFloat(maxHeight * 0.5, maxHeight);
        const buildingWidth = THREE.MathUtils.randFloat(baseWidth * 0.7, baseWidth * 1.1);
        const buildingDepth = THREE.MathUtils.randFloat(baseDepth * 0.7, baseDepth * 1.1);

        // Main Structure
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff, // Base for texture
            roughness: 0.75,
            metalness: 0.15
        });
        if (this.wallTexture && this.wallTexture.image) { // Check if texture image is loaded
            buildingMaterial.map = this.wallTexture.clone(); // Clone to avoid shared state if this texture is used elsewhere
            buildingMaterial.map.repeat.set(buildingWidth / 5, buildingHeight / 5); // Adjust UV repeat based on building size
            buildingMaterial.map.needsUpdate = true;
        } else {
            buildingMaterial.color.set(this.getRandomBuildingColor(theme));
        }


        const buildingGeo = new THREE.BoxGeometry(buildingWidth, buildingHeight, buildingDepth);
        const mainStructure = new THREE.Mesh(buildingGeo, buildingMaterial);
        mainStructure.castShadow = true;
        mainStructure.receiveShadow = true;
        mainStructure.position.y = buildingHeight / 2; // Center of box at half height, so base is at y=0 of group
        this.group.add(mainStructure);

        this.addWindows(mainStructure, buildingWidth, buildingHeight, buildingDepth);
        this.addEntrance(mainStructure, buildingWidth, buildingHeight, buildingDepth);
        if (Math.random() < 0.5) this.addBalconies(mainStructure, buildingWidth, buildingHeight, buildingDepth);
        this.addRoofDetails(mainStructure, buildingWidth, buildingHeight, buildingDepth);
    }

    getRandomBuildingColor(theme) {
        const colors = [0xCCCCCC, 0xDDDDDD, 0xB0B0B0, 0x99AABF, 0x778899, 0xAFAFAF, 0xC0C0C0];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    addWindows(parentMesh, bWidth, bHeight, bDepth) {
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff, // Base color, texture will override
            emissive: new THREE.Color(0x111122).multiplyScalar(Math.random() * 0.6 + 0.1), // Random dim emissive for night effect
            transparent: true,
            opacity: 0.75,
            roughness: 0.2,
            metalness: 0.1
        });
        if (this.windowTexture && this.windowTexture.image) {
            windowMaterial.map = this.windowTexture.clone();
            windowMaterial.map.needsUpdate = true;
            // windowMaterial.map.repeat.set(1,1); // Often window textures are 1:1 per window mesh
        } else {
             windowMaterial.color.set(0x447799); // Fallback color if no texture
        }


        const windowRows = Math.max(1, Math.floor(bHeight / 3.8)); // Number of rows based on height
        const windowColsFB = Math.max(1, Math.floor(bWidth / 2.8)); // Number of columns on Front/Back
        const windowColsSide = Math.max(1, Math.floor(bDepth / 2.8)); // Number of columns on Sides

        const windowH = 1.9; // Window height
        const windowW = 1.1; // Window width
        const windowD = 0.05; // Window depth (thin plane)

        const vertSpacing = (bHeight - windowRows * windowH) / (windowRows + 1); // Vertical spacing between windows
        const horizSpacingFB = (bWidth - windowColsFB * windowW) / (windowColsFB + 1); // Horizontal spacing (Front/Back)
        const horizSpacingSide = (bDepth - windowColsSide * windowW) / (windowColsSide + 1); // Horizontal spacing (Sides)

        const windowGeo = new THREE.BoxGeometry(windowW, windowH, windowD); // Common geometry for F/B windows

        // Y position from bottom of parentMesh (-bHeight/2) upwards
        for (let r = 0; r < windowRows; r++) {
            const y = -bHeight / 2 + (r + 0.5) * windowH + (r + 1) * vertSpacing;
            // Front/Back Windows
            for (let c = 0; c < windowColsFB; c++) {
                const x = -bWidth / 2 + (c + 0.5) * windowW + (c + 1) * horizSpacingFB;
                const winF = new THREE.Mesh(windowGeo, windowMaterial);
                winF.position.set(x, y, bDepth / 2 + windowD / 10); // Slightly outset from building face
                parentMesh.add(winF);
                const winB = new THREE.Mesh(windowGeo, windowMaterial.clone()); // Use cloned material if emissive is randomized per window
                winB.position.set(x, y, -bDepth / 2 - windowD / 10);
                parentMesh.add(winB);
            }
            // Side Windows (geometry needs to be rotated or swapped W/D)
            const windowGeoSide = new THREE.BoxGeometry(windowD, windowH, windowW); // Swapped W/D for side windows
            for (let c = 0; c < windowColsSide; c++) {
                const z = -bDepth / 2 + (c + 0.5) * windowW + (c + 1) * horizSpacingSide;
                const winL = new THREE.Mesh(windowGeoSide, windowMaterial.clone());
                winL.position.set(-bWidth / 2 - windowD / 10, y, z);
                parentMesh.add(winL);
                const winR = new THREE.Mesh(windowGeoSide, windowMaterial.clone());
                winR.position.set(bWidth / 2 + windowD / 10, y, z);
                parentMesh.add(winR);
            }
        }
    }

    addEntrance(parentMesh, bWidth, bHeight, bDepth) {
        const entranceH = Math.min(4.0, bHeight * 0.15); // Entrance height
        const entranceW = Math.min(bWidth * 0.4, 5);    // Entrance width
        const entranceD = 0.6;                           // Entrance depth (protrusion)
        const entranceY = -bHeight / 2 + entranceH / 2;  // Base of entrance at building base

        const mat = new THREE.MeshStandardMaterial({ color: 0x505050 });
        const geo = new THREE.BoxGeometry(entranceW, entranceH, entranceD);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, entranceY, bDepth / 2 + entranceD / 2 - 0.1); // Position on front face, slightly inset
        parentMesh.add(mesh);

        // Door within the entrance
        const doorH = entranceH * 0.85;
        const doorW = entranceW * 0.4;
        const doorD = 0.1; // Door thickness
        const doorMat = new THREE.MeshStandardMaterial({color: 0xffffff}); // Base color for door
        if(this.doorTexture && this.doorTexture.image) {
            doorMat.map = this.doorTexture.clone();
            doorMat.map.needsUpdate = true;
        } else {
            doorMat.color.set(0x332211); // Fallback door color
        }
        const doorGeo = new THREE.BoxGeometry(doorW, doorH, doorD);
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0,0, entranceD / 2 + doorD / 2); // Position door on the front of the entrance structure
        mesh.add(door); // Add door as child of entrance structure
    }
    
    addBalconies(parentMesh, bWidth, bHeight, bDepth) {
        const balconyW = THREE.MathUtils.randFloat(2.5, Math.min(bWidth * 0.25, 4.5));
        const balconyH = 0.15; // Balcony floor thickness
        const balconyD = 1.2;  // Balcony depth (protrusion)
        const mat = new THREE.MeshStandardMaterial({ color: 0x787878 });

        const floors = Math.floor(bHeight / 3.8); // Estimate number of floors
        for (let f = 1; f < floors; f++) { // Start from 1st floor (not ground)
            if (Math.random() > 0.35) continue; // Chance to skip adding a balcony to this floor

            const y = -bHeight / 2 + (f * 3.8) + 0.5; // Balcony floor Y position (approximate floor height + offset)

            const geo = new THREE.BoxGeometry(balconyW, balconyH, balconyD);
            const balc = new THREE.Mesh(geo, mat);
            balc.castShadow = true;

            const sideChoice = Math.random();
            if (sideChoice < 0.5) { // Front balcony
                 balc.position.set(THREE.MathUtils.randFloat(-bWidth/2+balconyW/2, bWidth/2-balconyW/2), y, bDepth/2 + balconyD/2);
            } else { // Back balcony
                 balc.position.set(THREE.MathUtils.randFloat(-bWidth/2+balconyW/2, bWidth/2-balconyW/2), y, -bDepth/2 - balconyD/2);
            }
            // Could add side balconies with rotation if desired
            parentMesh.add(balc);
        }
    }

    addRoofDetails(parentMesh, bWidth, bHeight, bDepth) {
        const topY = bHeight / 2; // Y position of the building's rooftop
        const mat = new THREE.MeshStandardMaterial({color: 0xffffff}); // Base material for roof details
         if (this.roofTexture && this.roofTexture.image) {
            mat.map = this.roofTexture.clone();
            mat.map.repeat.set(bWidth/4, bDepth/4); // Adjust UV repeat for roof texture
            mat.map.needsUpdate = true;
        } else {
            mat.color.set(0x555555); // Fallback roof color
        }

        const type = Math.random();
        if (type < 0.3) { // Flat roof with a parapet wall
            const parapetH = THREE.MathUtils.randFloat(0.5, 1.2);
            // Parapet geo slightly larger to encompass the roof edge
            const parapetGeo = new THREE.BoxGeometry(bWidth + 0.2, parapetH, bDepth + 0.2); 
            const parapet = new THREE.Mesh(parapetGeo, mat);
            parapet.position.y = topY - parapetH/2 + 0.1; // Parapet base slightly above roof plane, centered
            parentMesh.add(parapet);
        } else if (type < 0.7) { // Roof with some boxes (AC units, utility boxes)
            const numBoxes = THREE.MathUtils.randInt(1,4);
            for(let i=0; i<numBoxes; i++){
                const boxW = THREE.MathUtils.randFloat(1, bWidth*0.2);
                const boxD = THREE.MathUtils.randFloat(1, bDepth*0.2);
                const boxH = THREE.MathUtils.randFloat(0.5, 2.5);
                const boxGeo = new THREE.BoxGeometry(boxW, boxH, boxD);
                const box = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({color:0x606060})); // Darker color for roof boxes
                box.position.set(
                    THREE.MathUtils.randFloatSpread(bWidth*0.8 - boxW), // Random X pos on roof
                    topY + boxH/2,                                     // Sit on top of the roof
                    THREE.MathUtils.randFloatSpread(bDepth*0.8 - boxD) // Random Z pos on roof
                );
                box.castShadow = true;
                parentMesh.add(box);
            }
        } // Else, plain roof (top of mainStructure mesh already serves as this)
    }
}