import { useReview } from '../hooks/useReview';
import { downloadJson } from '../lib/download';
import { exportSession } from '../replay/serialization';
import { Button } from './Button';
import { announce } from './LiveRegion';

export function ExportSessionButton() {
  const { log } = useReview();
  const download = () => {
    const now = new Date().toISOString();
    downloadJson(`spotcheck-session-${now.slice(0, 10)}T${now.slice(11, 16).replace(':', '')}.json`, exportSession(now, true));
    announce('Session exported');
  };
  return <Button variant="secondary" size="compact" disabled={log.length === 0} onClick={download}>Export session</Button>;
}
