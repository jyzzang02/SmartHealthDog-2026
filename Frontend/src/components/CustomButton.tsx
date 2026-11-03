import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';

interface CustomButtonProps {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  width?: number;
  backgroundColor?: string;
  textColor?: string;
}

const CustomButton: React.FC<CustomButtonProps> = ({
  text,
  onPress,
  disabled = false,
  width = 310,
  backgroundColor = '#0081D5',
  textColor = '#FFFFFF',
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { width },
        disabled ? styles.buttonDisabled : { backgroundColor },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.buttonText, { color: textColor }]}>{text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 310,
    height: 55,
    paddingHorizontal: 16,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonDisabled: {
    backgroundColor: '#E1E1E1',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    fontFamily: 'Pretendard-SemiBold',
    lineHeight: 22,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});

export default CustomButton;

