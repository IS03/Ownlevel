import { RefreshControl, type RefreshControlProps } from 'react-native';
import { usePullRefresh, type PullRead } from './pull-refresh';

type Props = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & { onRefresh: PullRead };

export function PullRefreshControl({ onRefresh, ...props }: Props) {
  const pull = usePullRefresh(onRefresh);
  return <RefreshControl {...props} {...pull} />;
}
