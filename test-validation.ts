import { OnboardingService } from './src/onboarding/onboarding.service';

const service = new OnboardingService(null as any, null as any, null as any, null as any);
const values = {
  investingYears: '1-3 yrs',
  totalStartupInvestments: '1-5'
};

try {
  // We need to bypass private if we call it directly, or we can just simulate it
  const hasString = (key: string) =>
      typeof values[key] === 'string' && (values[key] as string).trim().length > 0;
  
  const identityOk =
        hasString('entity_name')
        || hasString('full_name')               // from profile!
        || hasString('primary_contact_name')
        || hasString('investing_years_band')
        || hasString('investingYears');         // MATCHES Step 1!
      const contactOk =
        hasString('email')                      // from profile!
        || hasString('linkedin_url')            // from profile!
        || hasString('website_url')             // from profile!
        || hasString('total_investments_made_band')
        || hasString('totalStartupInvestments'); // MATCHES Step 1!

  console.log({ identityOk, contactOk, result: !!identityOk && !!contactOk });

} catch (e) {
  console.error(e);
}
