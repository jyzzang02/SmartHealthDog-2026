import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  Animated,
  StyleSheet,
} from 'react-native';

interface LogoAnimationProps {
  onAnimationComplete: () => void;
}

const LogoAnimation: React.FC<LogoAnimationProps> = ({ onAnimationComplete }) => {
  const logoTextOpacity = useRef(new Animated.Value(0)).current;
  const logoBulbOpacity = useRef(new Animated.Value(0)).current;
  const logoBulbTranslateY = useRef(new Animated.Value(50)).current;
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [showBulbFull, setShowBulbFull] = useState(false);
  const [showLogoFull, setShowLogoFull] = useState(false);

  useEffect(() => {
    let isActive = true;

    const schedule = (callback: () => void, delay: number) => {
      const timeoutId = setTimeout(() => {
        if (isActive) {
          callback();
        }
      }, delay);
      timeoutRefs.current.push(timeoutId);
    };

    Animated.timing(logoTextOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start(() => {
      if (!isActive) return;

      Animated.parallel([
        Animated.timing(logoBulbOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(logoBulbTranslateY, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!isActive) return;

        schedule(() => {
          setShowBulbFull(true);
          schedule(() => {
            setShowLogoFull(true);
            requestAnimationFrame(() => {
              schedule(onAnimationComplete, 50);
            });
          }, 300);
        }, 200);
      });
    });

    return () => {
      isActive = false;
      logoTextOpacity.stopAnimation();
      logoBulbOpacity.stopAnimation();
      logoBulbTranslateY.stopAnimation();
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, [logoBulbOpacity, logoBulbTranslateY, logoTextOpacity, onAnimationComplete]);

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        <View style={styles.logoContainer}>
          {!showLogoFull ? (
            <>
              <Animated.View
                style={[
                  styles.logoBulbContainer,
                  {
                    opacity: logoBulbOpacity,
                    transform: [{ translateY: logoBulbTranslateY }],
                  },
                ]}
              >
                <Image
                  source={
                    showBulbFull
                      ? require('../assets/logo_bulbFull.png')
                      : require('../assets/logo_bulb.png')
                  }
                  style={styles.logoBulb}
                  resizeMode="contain"
                />
              </Animated.View>

              <Animated.View
                style={[
                  styles.logoTextContainer,
                  {
                    opacity: logoTextOpacity,
                  },
                ]}
              >
                <Image
                  source={require('../assets/logo_text.png')}
                  style={styles.logoText}
                  resizeMode="contain"
                />
              </Animated.View>
            </>
          ) : (
            <View style={styles.logoFullContainer}>
              <Image
                source={require('../assets/logo_full.png')}
                style={styles.logoFull}
                resizeMode="contain"
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 100,
    height: 180,
  },
  logoTextContainer: {
    width: 139,
    height: 96,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    width: 139,
    height: 96,
  },
  logoBulbContainer: {
    width: 80,
    height: 80,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBulb: {
    width: 80,
    height: 80,
  },
  logoFullContainer: {
    width: 139,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoFull: {
    width: 139,
    height: 180,
  },
});

export default LogoAnimation;
