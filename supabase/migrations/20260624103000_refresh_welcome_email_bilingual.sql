CREATE OR REPLACE FUNCTION public.handle_new_user_marketing_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := trim(COALESCE(NEW.email, ''));
  v_locale TEXT := COALESCE(NULLIF(NEW.raw_user_meta_data->>'locale', ''), 'zh-CN');
BEGIN
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  IF v_locale NOT IN ('zh-CN', 'en-US') THEN
    v_locale := 'zh-CN';
  END IF;

  INSERT INTO public.marketing_email_preferences (user_id, email, locale)
  VALUES (NEW.id, v_email, v_locale)
  ON CONFLICT (user_id) DO UPDATE
  SET email = EXCLUDED.email,
      locale = EXCLUDED.locale,
      updated_at = NOW();

  INSERT INTO public.marketing_email_queue (
    user_id,
    recipient_email,
    email_type,
    subject,
    preview_text,
    html,
    text_body,
    cta_label,
    cta_url,
    campaign_key,
    metadata
  )
  VALUES (
    NEW.id,
    v_email,
    'welcome',
    CASE WHEN v_locale = 'en-US'
      THEN 'Welcome to WebToMind / 欢迎来到 WebToMind'
      ELSE '欢迎来到 WebToMind / Welcome to WebToMind'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN 'Your reusable AI image workflow is ready. Start from curated prompt cases.'
      ELSE '你的可复现 AI 图片工作流已经准备好，可以从精选 Prompt 案例开始。'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN $welcome_en$
<div style="margin:0;background:#f4f7ff;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#111827;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe5ff;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(17,24,39,.10);">
    <div style="background:linear-gradient(135deg,#0048ff 0%,#ff3ccf 56%,#d8ff2e 100%);padding:6px;"></div>
    <div style="padding:34px 30px 30px;">
      <p style="margin:0 0 14px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0048ff;">WebToMind Visual Prompt OS</p>
      <h1 style="margin:0 0 16px;font-size:34px;line-height:1.12;color:#0f172a;">Welcome to WebToMind<br><span style="color:#475569;">欢迎来到 WebToMind</span></h1>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.75;color:#334155;">Your workspace is ready. We are glad you are here: WebToMind is built for creators who do not want every AI image to be a one-off accident.</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.75;color:#334155;">你的工作区已经准备好。我们希望帮你把灵感图、提示词、风格和生成记录沉淀成可复用的创作资产，而不是每次都从零开始碰运气。</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:800;color:#0f172a;">A good first run / 推荐从这里开始</p>
        <ol style="margin:0;padding-left:20px;color:#334155;font-size:15px;line-height:1.8;">
          <li>Browse curated image prompt cases, then pick one close to your target style.<br>先浏览精选图片 Prompt 案例，找到接近你目标风格的一张。</li>
          <li>Open the full prompt structure and reuse the model, ratio, and visual logic.<br>打开完整提示词结构，复用模型、比例和视觉逻辑。</li>
          <li>Bring it back to the creator workspace, remix, regenerate, and save the version that works.<br>带回创作台继续改写、生成，并保存真正跑通的版本。</li>
        </ol>
      </div>
      <p style="margin:0 0 28px;">
        <a href="https://webtomind.com/en-US/prompts" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 22px;box-shadow:6px 6px 0 #d8ff2e;">Browse Prompt Cases / 查看案例库</a>
      </p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#64748b;">We will only send WebToMind case digests and product updates. You can unsubscribe anytime.</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">我们只会发送 WebToMind 精选案例、热门 Prompt 和产品更新；如果暂时不需要，可以随时退订。</p>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#64748b;"><a href="{{unsubscribe_url}}" style="color:#334155;text-decoration:underline;">Unsubscribe / 退订邮件</a></p>
    </div>
  </div>
</div>
$welcome_en$
      ELSE $welcome_zh$
<div style="margin:0;background:#f4f7ff;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#111827;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe5ff;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(17,24,39,.10);">
    <div style="background:linear-gradient(135deg,#0048ff 0%,#ff3ccf 56%,#d8ff2e 100%);padding:6px;"></div>
    <div style="padding:34px 30px 30px;">
      <p style="margin:0 0 14px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0048ff;">WebToMind Visual Prompt OS</p>
      <h1 style="margin:0 0 16px;font-size:34px;line-height:1.12;color:#0f172a;">欢迎来到 WebToMind<br><span style="color:#475569;">Welcome to WebToMind</span></h1>
      <p style="margin:0 0 18px;font-size:17px;line-height:1.75;color:#334155;">你的工作区已经准备好。很高兴你来到这里：WebToMind 是为不想让每张 AI 图片都变成“一次性碰运气”的创作者准备的。</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.75;color:#334155;">Your workspace is ready. We help you turn references, prompts, style decisions, and generation history into reusable creative assets.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:800;color:#0f172a;">推荐从这里开始 / A good first run</p>
        <ol style="margin:0;padding-left:20px;color:#334155;font-size:15px;line-height:1.8;">
          <li>先浏览精选图片 Prompt 案例，找到接近你目标风格的一张。<br>Browse curated image prompt cases and pick one close to your target style.</li>
          <li>打开完整提示词结构，复用模型、比例和视觉逻辑。<br>Open the full prompt structure and reuse the model, ratio, and visual logic.</li>
          <li>带回创作台继续改写、生成，并保存真正跑通的版本。<br>Bring it back to the creator workspace, remix, regenerate, and save the version that works.</li>
        </ol>
      </div>
      <p style="margin:0 0 28px;">
        <a href="https://webtomind.com/zh-CN/prompts" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-weight:800;border-radius:999px;padding:14px 22px;box-shadow:6px 6px 0 #d8ff2e;">查看 Prompt 案例库 / Browse Cases</a>
      </p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#64748b;">我们只会发送 WebToMind 精选案例、热门 Prompt 和产品更新；如果暂时不需要，可以随时退订。</p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#64748b;">We will only send WebToMind case digests and product updates. You can unsubscribe anytime.</p>
      <p style="margin:20px 0 0;font-size:13px;line-height:1.7;color:#64748b;"><a href="{{unsubscribe_url}}" style="color:#334155;text-decoration:underline;">退订邮件 / Unsubscribe</a></p>
    </div>
  </div>
</div>
$welcome_zh$
    END,
    CASE WHEN v_locale = 'en-US'
      THEN E'Welcome to WebToMind / 欢迎来到 WebToMind\n\nYour reusable AI image workflow is ready. Start from curated prompt cases, reuse a proven structure, then bring it back to the creator workspace.\n\n你的可复现 AI 图片工作流已经准备好。可以从精选 Prompt 案例开始，复用已经跑通的结构，再带回创作台继续改写。\n\nPrompt cases: https://webtomind.com/en-US/prompts'
      ELSE E'欢迎来到 WebToMind / Welcome to WebToMind\n\n你的可复现 AI 图片工作流已经准备好。可以从精选 Prompt 案例开始，复用已经跑通的结构，再带回创作台继续改写。\n\nYour reusable AI image workflow is ready. Start from curated prompt cases, reuse a proven structure, then bring it back to the creator workspace.\n\nPrompt 案例库：https://webtomind.com/zh-CN/prompts'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN 'Browse Prompt Cases / 查看案例库'
      ELSE '查看 Prompt 案例库 / Browse Cases'
    END,
    CASE WHEN v_locale = 'en-US'
      THEN 'https://webtomind.com/en-US/prompts'
      ELSE 'https://webtomind.com/zh-CN/prompts'
    END,
    'welcome:' || NEW.id::text,
    jsonb_build_object(
      'locale', v_locale,
      'source', 'auth_trigger',
      'templateVersion', 'welcome_bilingual_20260624'
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
