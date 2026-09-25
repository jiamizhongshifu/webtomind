import { describe, expect, it } from 'vitest';
import {
  buildZpayCheckoutFields,
  buildZpayOutTradeNo,
  buildZpaySigningPayload,
  formatCnyCents,
  parseCnyMoneyToCents,
  signZpayParameters,
  usdCentsToCnyCents,
  verifyZpayParameters
} from '../../api/utils/zpay';

describe('ZPAY signing and settlement helpers', () => {
  it('sorts ASCII parameter names and signs UTF-8 values without URL encoding', () => {
    const params = {
      type: 'alipay',
      return_url: 'https://webtomind.com/api/membership/zpay-return',
      pid: 'merchant-test',
      param: 'abc',
      out_trade_no: '123',
      notify_url: 'https://webtomind.com/api/membership/zpay-notify',
      name: 'WebToMind 专业版月度会员',
      money: '5.67',
      sign_type: 'MD5'
    };

    expect(buildZpaySigningPayload(params)).toBe(
      'money=5.67&name=WebToMind 专业版月度会员&notify_url=https://webtomind.com/api/membership/zpay-notify&out_trade_no=123&param=abc&pid=merchant-test&return_url=https://webtomind.com/api/membership/zpay-return&type=alipay'
    );
    expect(signZpayParameters(params, 'test-key')).toBe(
      '0fd96b75357ef5bc896b3d382495ac44'
    );
    expect(
      verifyZpayParameters(
        {
          ...params,
          sign: '0fd96b75357ef5bc896b3d382495ac44'
        },
        'test-key'
      )
    ).toBe(true);
  });

  it('converts catalog USD cents into fixed CNY cents exactly once', () => {
    expect(usdCentsToCnyCents(2000, 7.2)).toBe(14_400);
    expect(formatCnyCents(14_400)).toBe('144.00');
    expect(parseCnyMoneyToCents('144.00')).toBe(14_400);
    expect(parseCnyMoneyToCents('144.001')).toBeNull();
  });

  it('builds a POST payload without exposing the merchant key', () => {
    const fields = buildZpayCheckoutFields({
      config: {
        pid: 'merchant-test',
        key: 'secret-test-key',
        usdToCnyRate: 7.2,
        submitUrl: 'https://zpayz.cn/submit.php'
      },
      orderId: '00000000-0000-4000-8000-000000000011',
      productName: 'WebToMind Pro 月度会员',
      cnyCents: 14_400,
      notifyUrl: 'https://webtomind.com/api/membership/zpay-notify',
      returnUrl: 'https://webtomind.com/api/membership/zpay-return'
    });

    expect(fields.out_trade_no).toBe('00000000302240678275694148452369');
    expect(fields.money).toBe('144.00');
    expect(fields.sign).toMatch(/^[a-f0-9]{32}$/);
    expect(JSON.stringify(fields)).not.toContain('secret-test-key');
    expect(
      buildZpayOutTradeNo('ffffffff-ffff-4fff-8fff-ffffffffffff')
    ).toMatch(/^\d{32}$/);
  });
});
