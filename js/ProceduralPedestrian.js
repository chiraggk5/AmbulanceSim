// js/ProceduralPedestrian.js
import * as THREE from 'three';
import { Config } from './Config.js';

export class ProceduralPedestrian {
    constructor(scene, position, height = 1.7, color = 0x996633) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.position.copy(position); // Initial position (feet on footpath, Y will be adjusted by main.js via baseY)
        this.height = height; 
        this.color = color; // Store color for use in buildPedestrian
        
        this.buildPedestrian();

        this.scene.add(this.group);
        this.walkPhase = Math.random() * Math.PI * 2; // Random start for walk animation
        
        this.baseY = this.group.position.y + this.height / 2; // Set by main.js to center ped model on footpath surface + half height
        this.speed = 0.02; 
        this.direction = 1; // 1 for +X, -1 for -X
        this.footpathZ = this.group.position.z; // Z-coordinate on the footpath they stick to
        this.movementAxis = 'x'; // Assume movement along X axis primarily
    }

    buildPedestrian() {
        // Dimensions relative to pedestrian height
        const radius = this.height * 0.15; // Torso radius
        const bodyCylinderHeight = this.height * 0.4;
        const headRadius = this.height * 0.12;
        
        const torsoMat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.9, metalness: 0.0 });
        const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.color).offsetHSL(0,0, -0.1), roughness: 0.9 }); // Slightly different shade for head

        // Torso - positioned so its center is at group's local origin (0,0,0)
        const torsoGeo = new THREE.CylinderGeometry(radius, radius * 0.8, bodyCylinderHeight, 8);
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0; // Torso center at group's y=0
        torso.castShadow = true;
        this.group.add(torso);

        // Head - on top of torso
        const headGeo = new THREE.SphereGeometry(headRadius, 10, 8);
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = bodyCylinderHeight / 2 + headRadius * 0.8; // Position head on top of torso center
        head.castShadow = true;
        this.group.add(head);

        // Legs
        const legLength = this.height * 0.45;
        const limbRadius = radius * 0.4;
        const legMat = new THREE.MeshStandardMaterial({color: new THREE.Color(this.color).offsetHSL(0,0, -0.2) }); // Darker shade for legs
        const legGeo = new THREE.CylinderGeometry(limbRadius, limbRadius*0.6, legLength, 6);
        
        // Position legs hanging down from torso center
        const legL = new THREE.Mesh(legGeo, legMat);
        legL.position.set(-radius*0.6, -bodyCylinderHeight/2 - legLength/2 + 0.1, 0); 
        legL.castShadow = true;
        this.group.add(legL);
        
        const legR = new THREE.Mesh(legGeo, legMat);
        legR.position.set(radius*0.6, -bodyCylinderHeight/2 - legLength/2 + 0.1, 0);
        legR.castShadow = true;
        this.group.add(legR);
        
        // In main.js, group.position.y will be set to footpath_surface + height / 2.
        // This makes the group's origin the center of the pedestrian model.
        // The internal parts are positioned relative to this center.
    }

    update(deltaTime) {
        this.walkPhase += deltaTime * 7 * (this.speed / 0.02) ; // Adjust animation speed with movement speed
        
        // Bobbing motion: baseY is the pedestrian's centered Y position when feet are flat on ground.
        // This should be set in main.js after pedestrian creation.
        const actualBaseY = this.baseY !== undefined ? this.baseY : ( (Config.roadSurfaceY ?? 0) + (Config.footpathHeightOffset || 0.05) + this.height / 2);
        this.group.position.y = actualBaseY + Math.sin(this.walkPhase) * 0.04;

        if (this.movementAxis === 'x') {
            this.group.position.x += this.speed * this.direction * deltaTime * 60; // Scale speed by fixed factor for consistency
            // Ensure pedestrian stays roughly on their Z footpath coordinate (dampen back if strayed)
            if (Math.abs(this.group.position.z - this.footpathZ) > 0.05) { 
                 this.group.position.z = THREE.MathUtils.damp(this.group.position.z, this.footpathZ, 3, deltaTime);
            }
        }
        
        // Wrap around logic for X position
        const numJunctions = Config.numJunctions ?? 1;
        const junctionSize = Config.junctionSize ?? 10;
        const roadLength = Config.roadLength ?? 60;
        const roadExtentX = (numJunctions * junctionSize + (numJunctions + 1) * roadLength) / 2 + 30; // Wider extent for peds

        if (this.group.position.x > roadExtentX && this.direction === 1) {
            this.group.position.x = -roadExtentX;
        } else if (this.group.position.x < -roadExtentX && this.direction === -1) {
             this.group.position.x = roadExtentX;
        }
    }
}