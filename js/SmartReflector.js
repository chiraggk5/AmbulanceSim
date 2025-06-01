// js/SmartReflector.js
import * as THREE from 'three';
import { Config } from './Config.js';

export class SmartReflector {
    constructor(position) {
        this.position = position; // Store for external reference if needed
        this.group = new THREE.Group();
        this.group.position.copy(position);
        this.id = `reflector-${Math.random().toString(36).substr(2, 9)}`;

        // Main body of the reflector
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.15, 0.25); // width, height, depth
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x777777 }); // Greyish body
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.castShadow = true;
        this.body.position.y = 0.15 / 2; // Sit on the ground (group origin is base)
        this.group.add(this.body);

        // Solar Panel (on top of the body)
        const panelGeo = new THREE.BoxGeometry(0.35, 0.03, 0.2);
        const panelMat = new THREE.MeshStandardMaterial({ color: Config.colors.solarPanel || 0x0000AA });
        this.solarPanel = new THREE.Mesh(panelGeo, panelMat);
        this.solarPanel.position.y = 0.15 + 0.03 / 2; // Positioned on top of the main body
        this.solarPanel.castShadow = true; // Small detail, might not be necessary to cast shadow
        this.group.add(this.solarPanel);

        // LED Reflectors (two strips on the front face)
        const ledGeo = new THREE.BoxGeometry(0.12, 0.08, 0.02); // Small, flat strips
        
        this.ledMaterial = new THREE.MeshStandardMaterial({
            color: Config.colors.reflector || 0xAAAAAA, 
            emissive: Config.colors.reflectorEmissiveOff || 0x111100, 
            emissiveIntensity: 1.0 
        });

        this.led1 = new THREE.Mesh(ledGeo, this.ledMaterial.clone()); // Clone material for independent control
        this.led1.position.set(-0.08, 0.05, 0.25 / 2 + 0.01); // Position on front face, slightly offset
        this.group.add(this.led1);

        this.led2 = new THREE.Mesh(ledGeo, this.ledMaterial.clone());
        this.led2.position.set(0.08, 0.05, 0.25 / 2 + 0.01); 
        this.group.add(this.led2);

        // Microphone (a small sphere on the side)
        const micGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const micMat = new THREE.MeshStandardMaterial({ color: Config.colors.microphone || 0xCCCCCC });
        this.microphone = new THREE.Mesh(micGeo, micMat);
        this.microphone.position.set(0.4 / 2 + 0.025, 0.075, 0); // Side of the main body
        this.group.add(this.microphone);

        // Store initial properties for restoring after signal
        this.originalLedColor = new THREE.Color(Config.colors.reflector || 0xAAAAAA);
        this.originalLedEmissive = new THREE.Color(Config.colors.reflectorEmissiveOff || 0x111100);
        this.originalLedEmissiveIntensity = 1.0;

        this.isSignaling = false;
    }

    triggerSignal() {
        if (this.isSignaling) return;
        this.isSignaling = true;

        const signalColor = new THREE.Color(Config.colors.reflectorSignal || 0x00FFFF);
        const signalEmissiveIntensity = 2.5;

        // Apply to LED1
        this.led1.material.color.set(signalColor);
        this.led1.material.emissive.set(signalColor);
        this.led1.material.emissiveIntensity = signalEmissiveIntensity;

        // Apply to LED2
        this.led2.material.color.set(signalColor);
        this.led2.material.emissive.set(signalColor);
        this.led2.material.emissiveIntensity = signalEmissiveIntensity;
        
        // No need for material.needsUpdate = true for color/emissive changes usually

        setTimeout(() => {
            this.led1.material.color.copy(this.originalLedColor);
            this.led1.material.emissive.copy(this.originalLedEmissive);
            this.led1.material.emissiveIntensity = this.originalLedEmissiveIntensity;

            this.led2.material.color.copy(this.originalLedColor);
            this.led2.material.emissive.copy(this.originalLedEmissive);
            this.led2.material.emissiveIntensity = this.originalLedEmissiveIntensity;
            
            this.isSignaling = false;
        }, Config.reflectorSignalDuration || 1500);
    }

    // Detects ambulance siren directly
    canDetectAmbulance(ambulancePosition) {
        return this.group.position.distanceTo(ambulancePosition) < (Config.sirenDetectionRadius || 40);
    }

    // Detects if another reflector (presumably already signaling) is close by for chain reaction
    isAmbulanceNear(otherReflectorPosition) { // Renamed parameter for clarity
        return this.group.position.distanceTo(otherReflectorPosition) < (Config.reflectorDetectionChainRadius || 3.0);
    }
}