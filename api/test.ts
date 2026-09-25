/**
 * 最简单的测试端点 - 使用 Edge Runtime
 */

export const config = {
  runtime: 'edge'
};

export default function handler(_request: Request) {
  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: 'Edge test endpoint works!'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}
