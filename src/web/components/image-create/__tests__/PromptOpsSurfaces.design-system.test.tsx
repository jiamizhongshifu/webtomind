import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const promptAssetOpsSource = readFileSync(
  resolve(__dirname, '../../../pages/PromptAssetOpsPage.tsx'),
  'utf8'
);
const aiUsageSummarySource = readFileSync(
  resolve(__dirname, '../AiUsageSummaryPanel.tsx'),
  'utf8'
);
const imageCreateStyles = readFileSync(
  resolve(__dirname, '../../../styles/image-create.css'),
  'utf8'
);

describe('prompt ops shadcn migration', () => {
  it('uses shadcn form controls for prompt asset operations', () => {
    expect(promptAssetOpsSource).toContain(
      "import { Button } from '@/shared/ui/radix/button';"
    );
    expect(promptAssetOpsSource).toContain("from '@/shared/ui/radix/empty'");
    expect(promptAssetOpsSource).toContain(
      "import { Field, FieldLabel } from '@/shared/ui/radix/field';"
    );
    expect(promptAssetOpsSource).toContain(
      "import { Input } from '@/shared/ui/radix/input';"
    );
    expect(promptAssetOpsSource).toContain("from '@/shared/ui/radix/select'");
    expect(promptAssetOpsSource).toContain(
      "import { Textarea } from '@/shared/ui/radix/textarea';"
    );
    expect(promptAssetOpsSource).toContain('<SelectTrigger');
    expect(promptAssetOpsSource).toContain('<SelectItem');
    expect(promptAssetOpsSource).toContain('<Empty');
    expect(promptAssetOpsSource).not.toContain('<select');
    expect(promptAssetOpsSource).not.toContain('<option');
    expect(promptAssetOpsSource).not.toContain('<textarea');
    expect(promptAssetOpsSource).not.toContain('<input');
  });

  it('uses shared controls with adapter-backed alert and table primitives for AI usage summary', () => {
    expect(aiUsageSummarySource).toContain(
      "import { Alert, AlertDescription } from '@/shared/ui/radix/alert';"
    );
    expect(aiUsageSummarySource).toContain(
      "import { Button, Input } from '@/shared/ui';"
    );
    expect(aiUsageSummarySource).toContain(
      "import { Field, FieldLabel } from '@/shared/ui/radix/field';"
    );
    expect(aiUsageSummarySource).toContain("from '@/shared/ui/radix/table'");
    expect(aiUsageSummarySource).toContain('<TableHeader');
    expect(aiUsageSummarySource).toContain('<TableCell');
    expect(aiUsageSummarySource).not.toContain('<table');
    expect(aiUsageSummarySource).not.toContain('<thead');
    expect(aiUsageSummarySource).not.toContain('<tbody');
    expect(aiUsageSummarySource).not.toContain('<input');
    expect(aiUsageSummarySource).not.toContain('<label');
  });

  it('keeps local sizing hooks for migrated prompt ops triggers', () => {
    expect(imageCreateStyles).toContain('.prompt-ops-select-trigger');
    expect(imageCreateStyles).toContain(
      '.prompt-ops-form-grid .prompt-ops-field'
    );
  });
});
