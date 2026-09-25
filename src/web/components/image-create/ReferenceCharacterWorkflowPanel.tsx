import { useEffect, useState } from 'react';
import {
  Layers3,
  Loader2,
  PackageCheck,
  Play,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import type { ImageCharacterCard } from '@/shared/image-reference-types';
import type {
  ImageCharacterReferenceGroup,
  ImageConsistencyCheckResult
} from '@/shared/image-reference-types';
import {
  deleteImageCreatorRecipe,
  listImageCreatorRecipes,
  saveImageCreatorRecipe,
  type ImageCreatorRecipe
} from '@/services/agent-api';
import { Button } from '@/shared/ui/radix/button';
import { trackImageGenerationEvent } from '../../lib/analytics';
import { CharacterConsistencyPanel } from './CharacterConsistencyPanel';
import { ReferenceImagePanel } from './ReferenceImagePanel';

interface ReferenceCharacterWorkflowPanelProps {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  selectedReferenceIds: string[];
  selectedCharacterIds: string[];
  onSelectedReferenceIdsChange: (ids: string[]) => void;
  onSelectedCharacterIdsChange: (ids: string[]) => void;
  onSelectedCharactersChange: (characters: ImageCharacterCard[]) => void;
  setError: (message: string) => void;
  setStatusText: (message: string) => void;
  canCheckConsistency: boolean;
  consistencyChecking: boolean;
  consistencyResult: ImageConsistencyCheckResult | null;
  onCheckConsistency: () => void;
  onUseRepairPrompt: (repairPrompt: string) => void;
  settings: Record<string, unknown>;
  selection: Record<string, unknown>;
  currentCharacterReferenceGroups: ImageCharacterReferenceGroup[];
  currentPrompt: string;
  currentNegativePrompt: string;
  onApplyRecipe: (recipe: ImageCreatorRecipe) => void;
  onRunRecipe: (recipe: ImageCreatorRecipe) => void;
  onCharacterCreated?: (character: ImageCharacterCard) => void;
}

function getConsistencyVerdictLabel(
  verdict: ImageConsistencyCheckResult['verdict']
): string {
  if (verdict === 'pass') return '通过';
  if (verdict === 'needs_repair') return '需要修复';
  return '建议复核';
}

function clampImageCount(value: unknown): number {
  return Math.max(1, Math.min(4, Math.floor(Number(value) || 1)));
}

function buildStyleBatchScenes(prompt: string, negativePrompt: string) {
  const variants = [
    {
      name: '原始风格',
      suffix: ''
    },
    {
      name: '社媒方图',
      suffix:
        '\n\nVariation goal: keep the same visual style, palette, lighting, and subject language, but compose it as a polished square social post with a clear central focal point and generous safe margins.'
    },
    {
      name: '商品主视觉',
      suffix:
        '\n\nVariation goal: keep the same visual style, palette, lighting, and subject language, but adapt it into a clean commercial key visual with stronger hierarchy, readable negative space, and premium product-poster framing.'
    }
  ];

  return variants.map((variant, index) => ({
    id: crypto.randomUUID(),
    name: variant.name,
    prompt: `${prompt}${variant.suffix}`,
    negativePrompt: negativePrompt || undefined,
    imageCount: 1,
    sortOrder: index
  }));
}

function getRecipeTypeLabel(recipe: ImageCreatorRecipe): string {
  return recipe.recipeType === 'style_batch_pack' ? '风格批量' : '角色场景';
}

export function ReferenceCharacterWorkflowPanel({
  isAuthenticated,
  onRequireLogin,
  selectedReferenceIds,
  selectedCharacterIds,
  onSelectedReferenceIdsChange,
  onSelectedCharacterIdsChange,
  onSelectedCharactersChange,
  setError,
  setStatusText,
  canCheckConsistency,
  consistencyChecking,
  consistencyResult,
  onCheckConsistency,
  onUseRepairPrompt,
  settings,
  selection,
  currentCharacterReferenceGroups,
  currentPrompt,
  currentNegativePrompt,
  onApplyRecipe,
  onRunRecipe,
  onCharacterCreated
}: ReferenceCharacterWorkflowPanelProps) {
  const hasSelectedReferences = selectedReferenceIds.length > 0;
  const [recipes, setRecipes] = useState<ImageCreatorRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesSaving, setRecipesSaving] = useState(false);
  const [recipeDeletingId, setRecipeDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setRecipesLoading(true);
    listImageCreatorRecipes()
      .then((items) => {
        if (!cancelled) setRecipes(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : '场景套件加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) setRecipesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, setError]);

  const handleSaveCharacterRecipe = async () => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    const prompt = currentPrompt.trim();
    if (!prompt) {
      setError('请先准备一个可生成的提示词，再保存场景套件。');
      return;
    }
    setRecipesSaving(true);
    try {
      const saved = await saveImageCreatorRecipe({
        name: `角色场景套件 ${new Date().toLocaleDateString('zh-CN')}`,
        recipeType: 'character_scene_pack',
        settings,
        selection,
        characterCardIds: selectedCharacterIds,
        characterReferenceGroups: currentCharacterReferenceGroups,
        scenes: [
          {
            id: crypto.randomUUID(),
            name: '当前场景',
            prompt,
            negativePrompt: currentNegativePrompt.trim() || undefined,
            imageCount: clampImageCount(settings.imageCount),
            sortOrder: 0
          }
        ],
        metadata: {
          selectedReferenceIds
        }
      });
      setRecipes((current) => [saved, ...current]);
      trackImageGenerationEvent('recipe_save', {
        recipe_type: saved.recipeType,
        scene_count: saved.scenes.length,
        source: 'character_workflow_panel'
      });
      setStatusText('已保存角色场景套件');
    } catch (error) {
      setError(error instanceof Error ? error.message : '场景套件保存失败');
    } finally {
      setRecipesSaving(false);
    }
  };

  const handleSaveStyleBatchRecipe = async () => {
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    const prompt = currentPrompt.trim();
    if (!prompt) {
      setError('请先准备一个可生成的提示词，再保存风格批量套件。');
      return;
    }
    setRecipesSaving(true);
    try {
      const saved = await saveImageCreatorRecipe({
        name: `风格批量套件 ${new Date().toLocaleDateString('zh-CN')}`,
        description: '从当前提示词保存，可一键生成 3 个常用风格应用场景。',
        recipeType: 'style_batch_pack',
        settings: {
          ...settings,
          imageCount: 1
        },
        selection,
        characterCardIds: [],
        characterReferenceGroups: [],
        scenes: buildStyleBatchScenes(prompt, currentNegativePrompt.trim()),
        metadata: {
          selectedReferenceIds,
          source: 'current_prompt',
          baseImageCount: clampImageCount(settings.imageCount)
        }
      });
      setRecipes((current) => [saved, ...current]);
      trackImageGenerationEvent('recipe_save', {
        recipe_type: saved.recipeType,
        scene_count: saved.scenes.length,
        source: 'character_workflow_panel'
      });
      setStatusText('已保存风格批量套件');
    } catch (error) {
      setError(error instanceof Error ? error.message : '风格批量套件保存失败');
    } finally {
      setRecipesSaving(false);
    }
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    setRecipeDeletingId(recipeId);
    try {
      await deleteImageCreatorRecipe(recipeId);
      setRecipes((current) =>
        current.filter((recipe) => recipe.id !== recipeId)
      );
      setStatusText('已删除场景套件');
    } catch (error) {
      setError(error instanceof Error ? error.message : '场景套件删除失败');
    } finally {
      setRecipeDeletingId(null);
    }
  };

  return (
    <aside className="creator-panel character-workflow-panel">
      <div className="creator-panel-head character-workflow-head">
        <span>角色一致性工作流</span>
        <strong>{selectedReferenceIds.length}</strong>
      </div>
      <p className="character-workflow-note">
        先上传或选择参考图，再保存角色卡；生成后可检查角色特征是否漂移。
      </p>
      <div className="character-workflow-steps" aria-label="角色一致性步骤">
        <span className="active">1 上传参考图</span>
        <span className={hasSelectedReferences ? 'active' : ''}>
          2 管理角色卡
        </span>
        <span className={canCheckConsistency ? 'active' : ''}>
          3 一致性检查
        </span>
      </div>

      <ReferenceImagePanel
        isAuthenticated={isAuthenticated}
        onRequireLogin={onRequireLogin}
        selectedReferenceIds={selectedReferenceIds}
        onSelectedReferenceIdsChange={onSelectedReferenceIdsChange}
        setError={setError}
        setStatusText={setStatusText}
      />

      {hasSelectedReferences ? (
        <>
          <CharacterConsistencyPanel
            isAuthenticated={isAuthenticated}
            onRequireLogin={onRequireLogin}
            selectedReferenceIds={selectedReferenceIds}
            selectedCharacterIds={selectedCharacterIds}
            onSelectedReferenceIdsChange={onSelectedReferenceIdsChange}
            onSelectedCharacterIdsChange={onSelectedCharacterIdsChange}
            onSelectedCharactersChange={onSelectedCharactersChange}
            setError={setError}
            setStatusText={setStatusText}
            onCharacterCreated={onCharacterCreated}
          />

          <section className="creator-subpanel creator-consistency-card">
            <div className="creator-consistency-head">
              <span>
                <ShieldCheck size={15} />
                一致性检查
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCheckConsistency}
                disabled={consistencyChecking || !canCheckConsistency}
              >
                {consistencyChecking ? (
                  <Loader2
                    className="creator-spin-icon"
                    data-icon="inline-start"
                  />
                ) : null}
                {consistencyResult ? '重新检查' : '检查'}
              </Button>
            </div>

            {consistencyResult ? (
              <div className="creator-consistency-body">
                <div className="creator-consistency-score">
                  <strong>{Math.round(consistencyResult.score * 100)}%</strong>
                  <span>
                    {getConsistencyVerdictLabel(consistencyResult.verdict)}
                  </span>
                </div>
                {consistencyResult.driftedTraits.length > 0 && (
                  <p>
                    漂移点：
                    {consistencyResult.driftedTraits.slice(0, 3).join('、')}
                  </p>
                )}
                {consistencyResult.matchedTraits.length > 0 && (
                  <p>
                    保持点：
                    {consistencyResult.matchedTraits.slice(0, 3).join('、')}
                  </p>
                )}
                {consistencyResult.repairPrompt && (
                  <Button
                    type="button"
                    size="sm"
                    className="creator-consistency-repair"
                    onClick={() =>
                      onUseRepairPrompt(consistencyResult.repairPrompt)
                    }
                  >
                    使用修复提示词
                  </Button>
                )}
              </div>
            ) : (
              <p className="creator-consistency-empty">
                完成一次生成后，可检查身份、服装和 A/B 分组是否稳定。
              </p>
            )}
          </section>
        </>
      ) : (
        <div className="creator-subpanel character-workflow-next">
          <strong>先完成参考图选择</strong>
          <p>
            上传或选中至少 1 张参考图后，再创建角色卡、管理 A/B
            分组和执行一致性检查。
          </p>
        </div>
      )}

      <section className="creator-subpanel creator-recipe-card">
        <div className="creator-consistency-head">
          <span>
            <PackageCheck size={15} />
            创作套件
          </span>
        </div>
        <div className="creator-recipe-save-grid">
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSaveCharacterRecipe()}
            disabled={recipesSaving || !hasSelectedReferences}
          >
            {recipesSaving ? (
              <Loader2 className="creator-spin-icon" data-icon="inline-start" />
            ) : (
              <PackageCheck data-icon="inline-start" />
            )}
            保存角色场景
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleSaveStyleBatchRecipe()}
            disabled={recipesSaving}
          >
            {recipesSaving ? (
              <Loader2 className="creator-spin-icon" data-icon="inline-start" />
            ) : (
              <Layers3 data-icon="inline-start" />
            )}
            保存风格批量
          </Button>
        </div>
        {recipesLoading ? (
          <p className="creator-consistency-empty">正在加载创作套件...</p>
        ) : recipes.length === 0 ? (
          <p className="creator-consistency-empty">
            保存角色、参考图和提示词可做场景复用；保存风格批量可一键生成多种用途图。
          </p>
        ) : (
          <div className="creator-recipe-list">
            {recipes.slice(0, 6).map((recipe) => {
              const missingCount =
                (recipe.missingCharacterCardIds?.length || 0) +
                (recipe.missingReferenceImageIds?.length || 0);
              return (
                <article key={recipe.id} className="creator-recipe-item">
                  <div>
                    <strong>{recipe.name}</strong>
                    <small>
                      {getRecipeTypeLabel(recipe)} · {recipe.scenes.length}{' '}
                      个场景
                      {missingCount > 0 ? ` · ${missingCount} 项缺失` : ''}
                    </small>
                  </div>
                  <span className="creator-recipe-actions">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title="应用套件"
                      aria-label="应用套件"
                      onClick={() => onApplyRecipe(recipe)}
                    >
                      应用
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="按套件生成"
                      aria-label="按套件生成"
                      onClick={() => onRunRecipe(recipe)}
                    >
                      <Play />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="删除套件"
                      aria-label="删除套件"
                      disabled={recipeDeletingId === recipe.id}
                      onClick={() => void handleDeleteRecipe(recipe.id)}
                    >
                      {recipeDeletingId === recipe.id ? (
                        <Loader2 className="creator-spin-icon" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </aside>
  );
}
