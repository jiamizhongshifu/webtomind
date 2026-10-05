function asRate(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : null;
}

function readRate(value, fallback) {
  const parsed = asRate(value);
  return parsed === null ? fallback : parsed;
}

function readCount(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getImageGenerationHealthPolicy(env = process.env) {
  return {
    maxFailureRate: readRate(env.IMAGE_HEALTH_MAX_FAILURE_RATE, 0.1),
    targetFailureRate: readRate(env.IMAGE_HEALTH_TARGET_FAILURE_RATE, 0.1),
    routeWarningMinAttempts: readCount(
      env.IMAGE_HEALTH_ROUTE_WARNING_MIN_ATTEMPTS,
      20
    ),
    routeWarningMinSuccessRate: readRate(
      env.IMAGE_HEALTH_ROUTE_WARNING_MIN_SUCCESS_RATE,
      0.5
    )
  };
}

export function evaluateImageGenerationHealth(report, policy = {}) {
  const effectivePolicy = {
    ...getImageGenerationHealthPolicy({}),
    ...policy
  };
  const blockers = [];
  const warnings = [];

  if (!report?.ok) {
    blockers.push({
      class: 'image_health_unavailable',
      detail: `Observed image generation facts are ${report?.status || 'unknown'}.`
    });
    return { ok: false, blockers, warnings, policy: effectivePolicy };
  }

  const failureRate = asRate(report.failureRate);
  if (failureRate === null) {
    blockers.push({
      class: 'image_failure_rate_unavailable',
      detail:
        'No measured failure rate is available; reliability has not been verified.'
    });
  }
  if (failureRate !== null && failureRate > effectivePolicy.maxFailureRate) {
    blockers.push({
      class: 'image_failure_rate_above_release_ceiling',
      detail: `${(failureRate * 100).toFixed(1)}% exceeds the release ceiling of ${(effectivePolicy.maxFailureRate * 100).toFixed(1)}%.`
    });
  } else if (
    failureRate !== null &&
    failureRate > effectivePolicy.targetFailureRate
  ) {
    warnings.push({
      class: 'image_failure_rate_above_target',
      detail: `${(failureRate * 100).toFixed(1)}% exceeds the reliability target of ${(effectivePolicy.targetFailureRate * 100).toFixed(1)}%.`
    });
  }

  if (report.chargedFailures > 0 && report.failureRefundCompliance !== 1) {
    blockers.push({
      class: 'image_refund_ledger_incomplete',
      detail: `${report.refundedChargedFailures || 0}/${report.chargedFailures} charged failures have matching refund ledger facts.`
    });
  }

  const paidFailureRate = asRate(report.enqueueEntitlements?.paidFailureRate);
  if (paidFailureRate !== null && paidFailureRate > 0.05) {
    blockers.push({
      class: 'paid_image_failure_rate_above_target',
      detail: `${(paidFailureRate * 100).toFixed(1)}% paid-cohort failures exceed the 5% target.`
    });
  } else if (paidFailureRate === null) {
    warnings.push({
      class: 'paid_image_reliability_unverified',
      detail:
        'Insufficient task-time paid-cohort samples; the 95% paid success target is not certified.'
    });
  }

  for (const route of report.attempts?.byRoute || []) {
    const routeSuccessRate = asRate(route.successRate);
    if (
      route.total >= effectivePolicy.routeWarningMinAttempts &&
      routeSuccessRate !== null &&
      routeSuccessRate < effectivePolicy.routeWarningMinSuccessRate
    ) {
      warnings.push({
        class: 'image_provider_route_below_target',
        route: route.key,
        detail: `${route.succeeded}/${route.total} attempts succeeded.`
      });
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    policy: effectivePolicy
  };
}
