import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Copy, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card, FeedbackMessage } from '@/shared/ui';
import {
  createMoodboard,
  getSharedMoodboard
} from '@/services/create-workspace-v2-api';
import type { VisualMoodboard } from '@/shared/create-workspace-v2';
import { Logo } from '@/workspace/components/Logo';
import '../styles/create-workspace-v2.css';

function getPrefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  return pathname.startsWith('/en-US')
    ? '/en-US'
    : pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
}

export function PublicMoodboardPage() {
  const { token = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const prefix = getPrefix(location.pathname);
  const isEnglish = prefix === '/en-US';
  const [board, setBoard] = useState<VisualMoodboard | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSharedMoodboard(token)
      .then(setBoard)
      .catch((loadError) =>
        setError(
          loadError instanceof Error ? loadError.message : '分享链接无效'
        )
      );
  }, [token]);

  const copyBoard = async () => {
    if (!board) return;
    setBusy(true);
    try {
      const copy = await createMoodboard({
        name: `${board.name} Copy`,
        sourceMoodboardId: board.id,
        sourceShareToken: token
      });
      navigate(`${prefix}/moodboards/${copy.id}`);
    } catch (copyError) {
      setError(
        copyError instanceof Error ? copyError.message : '复制失败，请先登录'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public-moodboard-page">
      <header>
        <button type="button" onClick={() => navigate(`${prefix}/create`)}>
          <Logo size={28} /> WebToMind
        </button>
        <span>{isEnglish ? 'Shared visual context' : '共享视觉语境'}</span>
      </header>
      {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}
      {board ? (
        <main>
          <section className="public-moodboard-copy">
            <span>
              <Sparkles /> {isEnglish ? 'Moodboard' : '情绪板'}
            </span>
            <h1>{board.name}</h1>
            <p>
              {board.description ||
                board.tasteProfile ||
                (isEnglish
                  ? 'A shared visual direction.'
                  : '一套可用于创作的共享视觉方向。')}
            </p>
            <div>
              <Button
                variant="primary"
                leadingIcon={<Wand2 />}
                onClick={() =>
                  navigate(
                    `${prefix}/image?moodboardId=${board.id}&shareToken=${token}`
                  )
                }
              >
                {isEnglish ? 'Create with moodboard' : '使用情绪板创作'}
              </Button>
              <Button
                variant="secondary"
                leadingIcon={<Copy />}
                disabled={busy}
                onClick={() => void copyBoard()}
              >
                {isEnglish ? 'Save a copy' : '保存个人副本'}
              </Button>
            </div>
          </section>
          <section className="public-moodboard-grid">
            {(board.items || []).map((item) => (
              <Card key={item.id} variant="media">
                <img
                  src={item.imageUrl}
                  alt={item.title || ''}
                  decoding="async"
                />
              </Card>
            ))}
          </section>
          <aside>
            <strong>{isEnglish ? 'Taste profile' : '风格分析'}</strong>
            <p>
              {board.tasteProfile ||
                (isEnglish
                  ? 'This board has not been analyzed yet.'
                  : '这套情绪板暂未生成风格分析。')}
            </p>
            <div>
              {board.keywords.map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </aside>
        </main>
      ) : !error ? (
        <div className="public-moodboard-loading">
          {isEnglish ? 'Loading…' : '正在加载…'}
        </div>
      ) : null}
    </div>
  );
}

export default PublicMoodboardPage;
