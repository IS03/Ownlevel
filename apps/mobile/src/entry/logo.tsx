import { useEffect, useId } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { brandTokens } from '@/design-system';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);
// Isotype: exact brand SVG. Entry-only wordmark: Hanken Grotesk 700 for all eight letters,
// outlined from the OFL font (google/fonts, ofl/hankengrotesk), at the same 0.2 em tracking.
// The shared brand artwork keeps its original two weights.
const paths = [
  "M28 48 H52 A14 14 0 0 1 66 62 V86 A14 14 0 0 1 52 100 H28 A14 14 0 0 1 14 86 V62 A14 14 0 0 1 28 48 Z M36 64 H44 A6 6 0 0 1 50 70 V78 A6 6 0 0 1 44 84 H36 A6 6 0 0 1 30 78 V70 A6 6 0 0 1 36 64 Z",
  "M76 50 Q76 44 82 44 L86 44 Q92 44 92 50 L92 72 Q92 78 86 78 L82 78 Q76 78 76 72 Z",
  "M76 89 Q76 84 81 84 L103 84 Q108 84 108 89 L108 95 Q108 100 103 100 L81 100 Q76 100 76 95 Z",
  "M33.306 521.418Q24.307 521.418 17.472 517.279Q10.637 513.14 6.818 505.689Q3 498.238 3 488.367Q3 478.404 6.818 470.953Q10.637 463.503 17.472 459.363Q24.307 455.224 33.306 455.224Q42.433 455.224 49.287 459.342Q56.141 463.46 59.958 470.904Q63.776 478.349 63.776 488.367Q63.776 498.293 59.913 505.738Q56.05 513.182 49.196 517.3Q42.342 521.418 33.306 521.418ZM33.29 510.183Q39.069 510.183 43.209 507.495Q47.349 504.808 49.636 499.907Q51.923 495.006 51.923 488.367Q51.923 481.644 49.632 476.741Q47.341 471.837 43.194 469.148Q39.046 466.459 33.279 466.459Q27.67 466.459 23.473 469.103Q19.276 471.746 17.019 476.638Q14.762 481.531 14.762 488.361Q14.762 495.111 17.019 500.004Q19.275 504.896 23.472 507.539Q27.668 510.183 33.29 510.183Z",
  "M105.772 520 86.738 456.642H99.027L112.19 501.966L124.244 460.314H135.842L147.896 501.966L161.022 456.642H173.312L154.277 520H142.878L129.079 474.331H131.006L117.208 520Z",
  "M198.782 520V456.642H210.89L240.451 504.62H237.488V456.642H249.25V520H237.015L207.636 471.931H210.545V520Z",
  "M279.593 520V456.642H291.355V509.492H318.299V520Z",
  "M343.587 520V456.642H385.802V467.15H355.35V482.24H383.747V492.748H355.35V509.492H385.802V520Z",
  "M434.434 520 409 456.642H421.962L440.724 505.583H437.033L455.468 456.642H468.485L443.178 520Z",
  "M493.574 520V456.642H535.788V467.15H505.336V482.24H533.734V492.748H505.336V509.492H535.788V520Z",
  "M564.295 520V456.642H576.057V509.492H603V520Z"
] as const;
export function EntryLogo({ width, reduced }: { width: number; reduced: boolean }) {
  const id = useId();
  const sweep = useSharedValue(-180);
  useEffect(() => {
    if (!reduced) {
      sweep.set(withRepeat(withSequence(
        withTiming(800, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withDelay(3100, withTiming(-180, { duration: 0 })),
      ), -1));
    } else {
      cancelAnimation(sweep);
      sweep.set(-180);
    }
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);
  const light = useAnimatedProps(() => ({ x1: sweep.value - 90, x2: sweep.value + 90 }));
  const ink = brandTokens.palette.dark.text;
  return (
    <Svg width={width} height={width * 521.21 / 605.83} viewBox="0 0 605.83 521.21"
      accessible accessibilityRole="image" accessibilityLabel="OWNLEVEL" testID="entry-logo">
      <G transform="translate(62.913 -94.000) scale(4.00000)">
        <G transform="translate(-1 8) skewY(-18)">
          <Path d={paths[0]} fill={ink} fillRule="evenodd" />
          <Path d={paths[1]} fill={ink} />
          <Path d={paths[2]} fill={brandTokens.palette.dark.accent} />
        </G>
      </G>
      <G fill={ink} testID="entry-wordmark">{paths.slice(3).map((d, i) => <Path key={i} d={d} />)}</G>
      {!reduced ? <>
        <Defs>
          <AnimatedGradient id={id} gradientUnits="userSpaceOnUse" y1={0} y2={0} animatedProps={light}>
            <Stop offset="0" stopColor="white" stopOpacity={0} />
            <Stop offset="0.5" stopColor="white" stopOpacity={0.32} />
            <Stop offset="1" stopColor="white" stopOpacity={0} />
          </AnimatedGradient>
        </Defs>
        <G fill={`url(#${id})`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="entry-wordmark-shine">
          {paths.slice(3).map((d, i) => <Path key={i} d={d} />)}
        </G>
      </> : null}
    </Svg>
  );
}
