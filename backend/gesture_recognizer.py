"""
Gesture Recognition Module
Recognizes hand gestures: pinch, open palm, point, two fingers
"""

import math


class GestureRecognizer:
    """Recognize hand gestures from MediaPipe landmarks"""
    
    def __init__(self):
        """Initialize gesture recognition thresholds"""
        # Pinch threshold (normalized distance)
        self.pinch_threshold = 0.05
        
        # Finger extension thresholds
        self.finger_up_threshold = 0.1
        
        # Gesture state tracking - optimized for responsiveness
        self.last_gesture = None
        self.gesture_confidence = 0
        self.min_confidence = 0.2  # Even lower for instant response
        self.confidence_increment = 0.15  # Faster confidence building
        self.confidence_decrement = 0.15  # Faster confidence decay
    
    def recognize(self, hands_data):
        """
        Recognize gestures from hand landmarks
        
        Args:
            hands_data: List of hand data dictionaries from HandTracker
            
        Returns:
            Dictionary with gesture type and additional data
        """
        if not hands_data or len(hands_data) == 0:
            return None
        
        # Use primary hand (first detected)
        hand = hands_data[0]
        landmarks = hand['landmarks']
        
        # Detect finger states
        fingers_up = self._detect_fingers_up(landmarks)
        
        # Recognize gesture
        gesture = self._classify_gesture(fingers_up, landmarks, hand)
        
        # Update confidence - faster response
        if gesture and gesture['type'] == self.last_gesture:
            self.gesture_confidence = min(1.0, self.gesture_confidence + self.confidence_increment)
        else:
            self.gesture_confidence = max(0.0, self.gesture_confidence - self.confidence_decrement)
            self.last_gesture = gesture['type'] if gesture else None
        
        # Always return gesture (even with low confidence for better responsiveness)
        if gesture and gesture.get('type') != 'none':
            gesture['confidence'] = self.gesture_confidence
            # Return gesture if confidence is above threshold OR if it's a new gesture type
            if self.gesture_confidence >= self.min_confidence or gesture['type'] != self.last_gesture:
                return gesture
        
        # Return 'none' gesture to indicate no gesture detected
        return {'type': 'none', 'confidence': 0}
    
    def _detect_fingers_up(self, landmarks):
        """
        Detect which fingers are extended
        
        Args:
            landmarks: List of landmark dictionaries
            
        Returns:
            Dictionary with finger states (True = up, False = down)
        """
        fingers = {
            'thumb': False,
            'index': False,
            'middle': False,
            'ring': False,
            'pinky': False
        }
        
        # Thumb: Compare x-coordinate of tip (4) with IP joint (3)
        # For right hand, thumb is up if tip x > IP x
        # For left hand, thumb is up if tip x < IP x
        if landmarks[4]['x'] > landmarks[3]['x']:
            fingers['thumb'] = True
        
        # Index finger: Compare y-coordinate of tip (8) with PIP (6)
        if landmarks[8]['y'] < landmarks[6]['y']:
            fingers['index'] = True
        
        # Middle finger: Compare y-coordinate of tip (12) with PIP (10)
        if landmarks[12]['y'] < landmarks[10]['y']:
            fingers['middle'] = True
        
        # Ring finger: Compare y-coordinate of tip (16) with PIP (14)
        if landmarks[16]['y'] < landmarks[14]['y']:
            fingers['ring'] = True
        
        # Pinky: Compare y-coordinate of tip (20) with PIP (18)
        if landmarks[20]['y'] < landmarks[18]['y']:
            fingers['pinky'] = True
        
        return fingers
    
    def _classify_gesture(self, fingers_up, landmarks, hand):
        """
        Classify gesture based on finger states and landmark positions
        
        Args:
            fingers_up: Dictionary of finger states
            landmarks: List of landmark dictionaries
            hand: Hand data dictionary
            
        Returns:
            Gesture dictionary with type and additional data
        """
        thumb_tip = landmarks[4]
        index_tip = landmarks[8]
        middle_tip = landmarks[12]
        wrist = landmarks[0]
        
        # Calculate distances
        thumb_index_distance = self._calculate_distance(thumb_tip, index_tip)
        
        # Count extended fingers
        extended_count = sum([
            fingers_up['thumb'],
            fingers_up['index'],
            fingers_up['middle'],
            fingers_up['ring'],
            fingers_up['pinky']
        ])
        
        # GESTURE PRIORITY: Check point FIRST (more specific), then pinch
        # This prevents pinch from triggering when user wants to point
        
        # GESTURE 1: POINT (only index finger up) - Check FIRST for priority
        if (fingers_up['index'] and 
            not fingers_up['middle'] and 
            not fingers_up['ring'] and 
            not fingers_up['pinky'] and
            thumb_index_distance >= self.pinch_threshold):  # Ensure not pinching
            return {
                'type': 'point',
                'position': {
                    'x': index_tip['x'],
                    'y': index_tip['y']
                },
                'direction': {
                    'x': index_tip['x'] - landmarks[5]['x'],  # Direction from MCP to tip
                    'y': index_tip['y'] - landmarks[5]['y']
                }
            }
        
        # GESTURE 2: PINCH (thumb + index finger close together)
        if thumb_index_distance < self.pinch_threshold:
            return {
                'type': 'pinch',
                'distance': thumb_index_distance,
                'position': {
                    'x': (thumb_tip['x'] + index_tip['x']) / 2,
                    'y': (thumb_tip['y'] + index_tip['y']) / 2
                }
            }
        
        # GESTURE 3: TWO FINGERS (index + middle up, others down)
        if (fingers_up['index'] and 
            fingers_up['middle'] and 
            not fingers_up['ring'] and 
            not fingers_up['pinky']):
            return {
                'type': 'two_fingers',
                'position': {
                    'x': (index_tip['x'] + middle_tip['x']) / 2,
                    'y': (index_tip['y'] + middle_tip['y']) / 2
                },
                'distance': self._calculate_distance(index_tip, middle_tip)
            }
        
        # GESTURE 4: OPEN PALM (4 or 5 fingers extended - robust for both hands)
        if extended_count >= 4:
            # Calculate palm center
            palm_center_x = sum(lm['x'] for lm in landmarks[0:5]) / 5
            palm_center_y = sum(lm['y'] for lm in landmarks[0:5]) / 5
            
            return {
                'type': 'open_palm',
                'position': {
                    'x': palm_center_x,
                    'y': palm_center_y
                },
                'fingers_extended': extended_count
            }
        
        # No recognized gesture
        return {
            'type': 'none',
            'extended_fingers': extended_count
        }
    
    def _calculate_distance(self, point1, point2):
        """
        Calculate Euclidean distance between two points
        
        Args:
            point1: Dictionary with x, y, z coordinates
            point2: Dictionary with x, y, z coordinates
            
        Returns:
            Distance as float
        """
        dx = point1['x'] - point2['x']
        dy = point1['y'] - point2['y']
        dz = point1['z'] - point2['z']
        return math.sqrt(dx*dx + dy*dy + dz*dz)

