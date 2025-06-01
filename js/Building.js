// js/Building.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Building {
    constructor(scene, modelPath, position, scale = { x: 1, y: 1, z: 1 }, rotationY = 0) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.position.copy(position);
        this.group.rotation.y = rotationY;
        this.loadModel(modelPath, scale);
        this.scene.add(this.group);
    }

    async loadModel(modelPath, scale) {
        const loader = new GLTFLoader();
        try {
            const gltf = await loader.loadAsync(modelPath);
            this.model = gltf.scene;
            this.model.scale.set(scale.x, scale.y, scale.z);

            this.model.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true; // Buildings can also receive shadows
                }
            });
            this.group.add(this.model);
            console.log(`Building model ${modelPath} loaded successfully.`);
        } catch (error) {
            console.error(`Failed to load building model ${modelPath}:`, error);
            // Optional: Add a placeholder if loading fails
            const placeholderGeo = new THREE.BoxGeometry(5, 10, 5); // Example dimensions
            const placeholderMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
            const placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
            placeholder.position.y = 5; // Adjust if needed
            this.group.add(placeholder);
        }
    }
}