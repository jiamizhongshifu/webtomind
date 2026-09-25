import { useEffect, useMemo, useState } from 'react';
import {
  getSelectableImageModelOptions,
  mergeRuntimeImageModelOptions,
  modelOptions
} from '../data/image-creator-options';
import { getVisualImageModels } from '@/services/agent-api';

let runtimeModelsPromise: ReturnType<typeof getVisualImageModels> | null = null;

function loadRuntimeModels() {
  runtimeModelsPromise ||= getVisualImageModels();
  return runtimeModelsPromise;
}

export function useRuntimeImageModels() {
  const [models, setModels] = useState(modelOptions);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadRuntimeModels()
      .then((runtimeModels) => {
        if (active) setModels(mergeRuntimeImageModelOptions(runtimeModels));
      })
      .catch(() => {
        runtimeModelsPromise = null;
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectableModels = useMemo(
    () => getSelectableImageModelOptions(models),
    [models]
  );

  return { models, selectableModels, loaded };
}
