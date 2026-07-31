/**
 * Live smoke test for the Drugs module — calls all 5 tools directly against
 * live upstream APIs (RxNorm, RxClass, OpenFDA). Run: npm run build && node scripts/smoke-drugs.mjs
 */
import { HttpClientService } from '../dist/integrations/http-client.service.js';
import { RxNormService } from '../dist/integrations/rxnorm.service.js';
import { OpenFdaService } from '../dist/integrations/openfda.service.js';
import { DrugsService } from '../dist/modules/drugs/drugs.service.js';
import { DrugsTools } from '../dist/modules/drugs/drugs.tools.js';

const ctx = {
  logger: {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  },
};

const http = new HttpClientService();
const drugs = new DrugsTools(new DrugsService(new RxNormService(http), new OpenFdaService(http)));

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

console.log('--- Drugs module live smoke ---\n');

// 2.1 drug_search (exposed as drugs_search via @Controller prefix)
const search = await drugs.search({ name: 'metformin', fuzzy: false }, ctx);
check('drug_search metformin', search.matches.length > 0 && search.matches[0].rxcui === '6809',
  `rxcui=${search.matches[0]?.rxcui}, classes=${search.matches[0]?.classes?.slice(0, 2).join(', ')}`);

// 2.2 drug_get_label_info
const label = await drugs.getLabelInfo({ drug_name: 'warfarin', sections: ['boxed_warning', 'drug_interactions'] }, ctx);
check('drug_get_label_info warfarin', label.found === true && Object.keys(label.sections).length > 0,
  `sections=[${Object.keys(label.sections).join(', ')}]`);

// 2.3 drug_check_interactions (warfarin + aspirin must surface evidence)
const ddi = await drugs.checkInteractions({ drugs: ['warfarin', 'aspirin'] }, ctx);
const hit = ddi.interactions.find((i) => i.pair.includes('warfarin') && i.pair.includes('aspirin'));
check('drug_check_interactions warfarin+aspirin', Boolean(hit),
  hit ? `severity=${hit.severity_band}, excerpt="${hit.evidence_excerpt.slice(0, 90)}..."` : 'NO INTERACTION FOUND');
check('methodology note present', /not proof of safety/i.test(ddi.methodology_note));

// 2.4 drug_get_adverse_events
const faers = await drugs.getAdverseEvents({ drug_name: 'ibuprofen', limit: 5 }, ctx);
check('drug_get_adverse_events ibuprofen', faers.top_reactions.length > 0,
  `top=${faers.top_reactions[0]?.term} (${faers.top_reactions[0]?.count})`);

// 2.5 drug_get_recalls
const recalls = await drugs.getRecalls({ drug_name: 'metformin' }, ctx);
check('drug_get_recalls metformin', Array.isArray(recalls.recalls),
  `${recalls.recalls.length} recall(s)`);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
