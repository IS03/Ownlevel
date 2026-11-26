import { useStartupHomePending } from '@/entry/transition';
import { HomeScreen } from '@/home/home-screen';

export default function HomeRoute() {
  const waiting = useStartupHomePending();
  return waiting ? null : <HomeScreen />;
}
