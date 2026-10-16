import { useState } from 'react';
import { Image, View } from 'react-native';
import { useMobileAuth } from '@/auth';
import { AppIcon, AppText, useOwnlevelTheme } from '@/design-system';
export function AccountAvatar({ name, size = 96 }: { name: string | null; size?: number }) {
  const { session } = useMobileAuth();
  const { colors } = useOwnlevelTheme();
  const metadata = session?.user.user_metadata;
  const url = [metadata?.avatar_url, metadata?.picture].find(
    (value) => typeof value === 'string' && /^https:\/\//.test(value),
  );
  const [failed, setFailed] = useState<string | null>(null);
  const valid = typeof url === 'string' && /^https:\/\//.test(url) && url !== failed;
  const style = { width: size, height: size, borderRadius: size / 2 };
  return valid ? (
    <Image
      source={{ uri: url }}
      onError={() => setFailed(url)}
      style={style}
      accessibilityLabel="Foto de tu cuenta"
    />
  ) : (
    <View
      style={[
        style,
        {
          backgroundColor: colors.brandSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {name?.trim() ? (
        <AppText variant={size > 44 ? 'largeTitle' : 'headline'} style={{ color: colors.primary }}>
          {name.trim().charAt(0).toLocaleUpperCase('es-AR')}
        </AppText>
      ) : (
        <AppIcon name="profile" size={size > 44 ? 24 : 20} color={colors.primary} />
      )}
    </View>
  );
}
