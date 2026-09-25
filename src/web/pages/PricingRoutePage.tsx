import { Navigate, useLocation } from 'react-router-dom';
import {
  getPricingLocalePrefix,
  getWorkspacePricingHref
} from '../lib/pricing-route';

export function PricingRoutePage() {
  const location = useLocation();
  return (
    <Navigate
      replace
      to={getWorkspacePricingHref(
        getPricingLocalePrefix(location.pathname),
        location.search
      )}
      state={location.state}
    />
  );
}

export default PricingRoutePage;
