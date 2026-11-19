import { MyViews } from '@/progress/my-views';
import { ProgressScroll } from '@/progress/progress-scroll';

/** Read saved views first; editing remains a separate, explicit action. */
export default function SavedViewsScreen() {
  return <ProgressScroll title="Mis vistas" testID="saved-views-screen"><MyViews standalone /></ProgressScroll>;
}
