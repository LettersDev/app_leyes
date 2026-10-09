import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { COLORS } from '../utils/constants';

const Spinner = ({ size = 26, color = COLORS.primary, style }) => {
    const rotation = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const anim = Animated.loop(
            Animated.timing(rotation, {
                toValue: 1,
                duration: 900,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        anim.start();
        return () => anim.stop();
    }, []);
    const spin = rotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    return (
        <Animated.View
            style={[{
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: Math.max(2, size * 0.1),
                borderColor: 'transparent',
                borderTopColor: color,
                transform: [{ rotate: spin }],
            }, style]}
        />
    );
};

export default Spinner;