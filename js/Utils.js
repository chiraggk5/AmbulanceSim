// js/Utils.js
import * as THREE from 'three';

export const Utils = {
    // Calculate distance between two THREE.Vector3 points
    distance: function(vec1, vec2) {
        return vec1.distanceTo(vec2);
    }
    // Add other general utility functions as needed for the simulation
};