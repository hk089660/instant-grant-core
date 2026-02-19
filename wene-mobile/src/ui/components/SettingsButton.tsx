import React from 'react';
import { TouchableOpacity, View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

interface SettingsButtonProps {
    onPress: () => void;
}

/**
 * ダークなピル型設定ボタン
 * ギアアイコン + "we-ne" テキスト
 */
export const SettingsButton: React.FC<SettingsButtonProps> = ({ onPress }) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
            <View style={styles.pill}>
                <Ionicons name="settings-sharp" size={16} color="#ffffff" />
                <Text style={styles.label}>we-ne</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.gray600,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 24,
        gap: 6,
        // 立体感のあるシャドウ
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    label: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
