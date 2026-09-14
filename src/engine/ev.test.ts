import { describe, expect, it } from "vitest";
import type { Card, Rank } from "./cards";
import { HI_LO, currentRunningCount, trueCount } from "./counting";
import { type Hand, createHand, evaluate } from "./hand";
import { DEFAULT_RULES, type RuleSet } from "./rules";
import { applyAction, dealerUpcard, startRound } from "./round";
import { createShoe, decksRemaining, remainingComposition } from "./shoe";
import { basicStrategy } from "./strategy";
import { REFERENCE_CHARTS } from "./strategy.reference";
import {
  type ActionEvs,
  DEALER_TOTALS,
  actionEvs,
  bestAction,
  compositionWithout,
  dealerOutcomes,
  evLoss,
  fullShoeComposition,
  rankActions,
  unseenComposition,
} from "./ev";

/**
 * Published reference tables for expected value — test fixture data, not engine code.
 *
 * Invariant 4 (CONTEXT.md) says the math is auditable, and "wrong math" is 21% of
 * low-star reviews in this category (ADR-0002). The EV numbers are what the Explanation
 * panel puts in front of the user to justify a verdict, so they are asserted here against
 * tables this engine did not produce, transcribed by hand from the published source.
 *
 * ## Sources
 *
 *  1. **Wizard of Odds — "Blackjack Appendix 1: Expected Values for Infinite Deck"**,
 *     https://wizardofodds.com/games/blackjack/appendix/1/ — four tables giving the
 *     expected return of standing, hitting, doubling and splitting every player hand
 *     against every upcard. The page states its assumptions: *"dealer stands on a soft
 *     17, an infinite deck, the player may double after a split, split up to three times
 *     except for aces, and draw only one card to split aces."*
 *
 *     An infinite deck is exactly what makes this the right yardstick for the
 *     combinatorics. Hand the engine a composition large enough that removing a card
 *     changes nothing, and every modelling choice about depletion drops out — so a
 *     disagreement here can only be an arithmetic bug.
 *
 *  2. **Wizard of Odds — "Blackjack Appendix 2A: Dealer Odds under U.S. Rules"**,
 *     https://wizardofodds.com/games/blackjack/appendix/2a/ — dealer final-hand
 *     probabilities for one to eight decks, S17 and H17, *after* the dealer peeks.
 *
 *  3. **Wizard of Odds — "Blackjack Appendix 2B: Dealer Odds under European Rules"**,
 *     https://wizardofodds.com/games/blackjack/appendix/2b/ — the same, for a dealer who
 *     has not peeked, with a separate blackjack column. The page notes the tables
 *     *"assume the dealer did not yet peek for blackjack"*, which is precisely the
 *     `dealerPeek: false` game.
 *
 *  4. **Wizard of Odds — "Composition-Dependent Strategy for Single Deck and Dealer
 *     Stands on Soft 17"**,
 *     https://wizardofodds.com/games/blackjack/composition-dependent-strategy-one-deck-stand-soft-17/
 *     — cited for the exceptions in `COMPOSITION_DEPENDENT_EXCEPTIONS` below, where an
 *     exact per-composition EV correctly parts company with a total-dependent chart.
 *
 * Every table below is in printed-chart column order: dealer 2, 3, 4, 5, 6, 7, 8, 9, 10, A.
 */

const UPCARDS: readonly Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

type Table = Readonly<Record<string, readonly number[]>>;

/** Appendix 1, "Stand". The first row covers every total of 16 or less: they all lose
 *  unless the dealer busts, so one row does for all of them. */
const APPENDIX_1_STAND: Table = {
  "16": [-0.292784, -0.25225, -0.211063, -0.167193, -0.153699, -0.475375, -0.510518, -0.54315, -0.54043, -0.666951],
  "17": [-0.152975, -0.117216, -0.080573, -0.044941, 0.011739, -0.106809, -0.381951, -0.423154, -0.419721, -0.478033],
  "18": [0.121742, 0.1483, 0.175854, 0.199561, 0.283444, 0.399554, 0.105951, -0.183163, -0.178301, -0.100199],
  "19": [0.386305, 0.404363, 0.423179, 0.439512, 0.495977, 0.615976, 0.593854, 0.287597, 0.063118, 0.277636],
  "20": [0.639987, 0.650272, 0.66105, 0.67036, 0.703959, 0.773227, 0.791815, 0.758357, 0.554538, 0.65547],
  "21": [0.882007, 0.8853, 0.888767, 0.891754, 0.902837, 0.925926, 0.930605, 0.939176, 0.962624, 0.922194],
};

/** Appendix 1, "Hit": draw one card, then play on optimally. `S` prefixes a soft total. */
const APPENDIX_1_HIT: Table = {
  "4": [-0.114913, -0.082613, -0.049367, -0.01238, 0.01113, -0.088279, -0.159334, -0.240666, -0.289198, -0.253077],
  "5": [-0.128216, -0.09531, -0.061479, -0.023979, -0.001186, -0.119447, -0.188093, -0.266615, -0.313412, -0.278575],
  "6": [-0.140759, -0.107291, -0.072917, -0.034916, -0.013006, -0.151933, -0.217242, -0.292641, -0.337749, -0.304147],
  "7": [-0.109183, -0.076583, -0.043022, -0.007271, 0.029185, -0.068808, -0.210605, -0.285365, -0.319055, -0.310072],
  "8": [-0.021798, 0.008005, 0.038784, 0.070805, 0.11496, 0.082207, -0.059898, -0.210186, -0.249375, -0.197029],
  "9": [0.074446, 0.101265, 0.128981, 0.158032, 0.196019, 0.171868, 0.098376, -0.052178, -0.152953, -0.065681],
  "10": [0.1825, 0.206088, 0.23047, 0.256259, 0.287795, 0.256909, 0.197954, 0.11653, 0.025309, 0.08145],
  "11": [0.238351, 0.260325, 0.28302, 0.30735, 0.33369, 0.292147, 0.229982, 0.158257, 0.119482, 0.143001],
  "12": [-0.25339, -0.233691, -0.213537, -0.193271, -0.170526, -0.212848, -0.271575, -0.340013, -0.381043, -0.35054],
  "13": [-0.307791, -0.29121, -0.274224, -0.257333, -0.235626, -0.269073, -0.323605, -0.387155, -0.425254, -0.39693],
  "14": [-0.362192, -0.348729, -0.334911, -0.321395, -0.300726, -0.321282, -0.371919, -0.43093, -0.466307, -0.440007],
  "15": [-0.416594, -0.406249, -0.395599, -0.385457, -0.365826, -0.369762, -0.416782, -0.471578, -0.504428, -0.480006],
  "16": [-0.470995, -0.463768, -0.456286, -0.44952, -0.430927, -0.414779, -0.45844, -0.509322, -0.539826, -0.517149],
  "17": [-0.536151, -0.531674, -0.527011, -0.522986, -0.508753, -0.483486, -0.505983, -0.553695, -0.584463, -0.5573],
  "18": [-0.622439, -0.620005, -0.617462, -0.61526, -0.607479, -0.591144, -0.591056, -0.616528, -0.647671, -0.626515],
  "19": [-0.729077, -0.728033, -0.726937, -0.725991, -0.722554, -0.71545, -0.71366, -0.715574, -0.729449, -0.724795],
  "20": [-0.85523, -0.854977, -0.85471, -0.85448, -0.853628, -0.851852, -0.851492, -0.850833, -0.849029, -0.852139],
  S12: [0.081836, 0.103507, 0.126596, 0.156482, 0.185954, 0.165473, 0.095115, 0.000066, -0.070002, -0.020478],
  S13: [0.046636, 0.074119, 0.102477, 0.133363, 0.161693, 0.122386, 0.054057, -0.037695, -0.104851, -0.057308],
  S14: [0.022392, 0.050807, 0.080081, 0.111894, 0.139165, 0.079507, 0.013277, -0.075163, -0.139467, -0.093874],
  S15: [-0.000121, 0.02916, 0.059285, 0.09196, 0.118246, 0.037028, -0.027055, -0.112189, -0.173704, -0.130027],
  S16: [-0.021025, 0.009059, 0.039975, 0.073449, 0.098821, -0.00489, -0.066795, -0.148644, -0.207441, -0.165637],
  S17: [-0.000491, 0.028975, 0.059326, 0.091189, 0.128052, 0.053823, -0.072915, -0.149787, -0.196867, -0.179569],
  S18: [0.062905, 0.090248, 0.118502, 0.147613, 0.190753, 0.170676, 0.039677, -0.100744, -0.143808, -0.092935],
  S19: [0.123958, 0.14934, 0.175577, 0.202986, 0.239799, 0.22062, 0.15227, 0.007893, -0.088096, -0.005743],
  S20: [0.1825, 0.206088, 0.23047, 0.256259, 0.287795, 0.256909, 0.197954, 0.11653, 0.025309, 0.08145],
  S21: [0.238351, 0.260325, 0.28302, 0.30735, 0.33369, 0.292147, 0.229982, 0.158257, 0.119482, 0.143001],
};

/** Appendix 1, "Double": two units on exactly one more card. Hence the range past -1. */
const APPENDIX_1_DOUBLE: Table = {
  "4": [-0.585567, -0.5045, -0.422126, -0.334385, -0.307398, -0.95075, -1.021035, -1.086299, -1.080861, -1.333902],
  "5": [-0.585567, -0.5045, -0.422126, -0.334385, -0.307398, -0.95075, -1.021035, -1.086299, -1.080861, -1.333902],
  "6": [-0.564058, -0.483726, -0.402051, -0.315577, -0.281946, -0.894048, -1.001256, -1.067839, -1.06229, -1.304837],
  "7": [-0.435758, -0.359779, -0.282299, -0.20273, -0.138337, -0.589336, -0.847076, -0.957074, -0.950866, -1.130452],
  "8": [-0.204491, -0.136216, -0.066372, 0.003456, 0.087015, -0.18773, -0.451987, -0.718501, -0.746588, -0.810746],
  "9": [0.061119, 0.120816, 0.181949, 0.243057, 0.317055, 0.10425, -0.026442, -0.300996, -0.466707, -0.432911],
  "10": [0.358939, 0.409321, 0.46094, 0.512517, 0.57559, 0.392412, 0.286636, 0.144328, -0.008659, -0.014042],
  "11": [0.470641, 0.517795, 0.566041, 0.614699, 0.66738, 0.462889, 0.350693, 0.227783, 0.179689, 0.109061],
  "12": [-0.50678, -0.467382, -0.427073, -0.386542, -0.341052, -0.506712, -0.615661, -0.737506, -0.796841, -0.829344],
  "13": [-0.615582, -0.58242, -0.548448, -0.514667, -0.471253, -0.587423, -0.690966, -0.80779, -0.867544, -0.880582],
  "14": [-0.724385, -0.697459, -0.669823, -0.642791, -0.601453, -0.668135, -0.766271, -0.878075, -0.938247, -0.931821],
  "15": [-0.833187, -0.812497, -0.791198, -0.770915, -0.731653, -0.748846, -0.841576, -0.94836, -1.00895, -0.983059],
  "16": [-0.94199, -0.927536, -0.912573, -0.899039, -0.861853, -0.829558, -0.916881, -1.018644, -1.079653, -1.034297],
  "17": [-1.072302, -1.063348, -1.054023, -1.045971, -1.017505, -0.966972, -1.011965, -1.10739, -1.168926, -1.1146],
  "18": [-1.244877, -1.24001, -1.234924, -1.230519, -1.214958, -1.182288, -1.182112, -1.233057, -1.295342, -1.253031],
  "19": [-1.458155, -1.456066, -1.453874, -1.451983, -1.445108, -1.430899, -1.42732, -1.431149, -1.458898, -1.44959],
  "20": [-1.710461, -1.709954, -1.70942, -1.708961, -1.707256, -1.703704, -1.702984, -1.701665, -1.698058, -1.704278],
  S12: [-0.07157, -0.007228, 0.058427, 0.125954, 0.179748, -0.183866, -0.314441, -0.456367, -0.514028, -0.624391],
  S13: [-0.07157, -0.007228, 0.058427, 0.125954, 0.179748, -0.183866, -0.314441, -0.456367, -0.514028, -0.624391],
  S14: [-0.07157, -0.007228, 0.058427, 0.125954, 0.179748, -0.183866, -0.314441, -0.456367, -0.514028, -0.624391],
  S15: [-0.07157, -0.007228, 0.058427, 0.125954, 0.179748, -0.183866, -0.314441, -0.456367, -0.514028, -0.624391],
  S16: [-0.07157, -0.007228, 0.058427, 0.125954, 0.179748, -0.183866, -0.314441, -0.456367, -0.514028, -0.624391],
  S17: [-0.007043, 0.055095, 0.118653, 0.182378, 0.256104, -0.013758, -0.255102, -0.400984, -0.458316, -0.537198],
  S18: [0.11975, 0.177641, 0.237004, 0.295225, 0.381506, 0.219948, -0.029917, -0.290219, -0.346892, -0.362813],
  S19: [0.241855, 0.295824, 0.351154, 0.405972, 0.479599, 0.319835, 0.195269, -0.072946, -0.235468, -0.188428],
  S20: [0.358939, 0.409321, 0.46094, 0.512517, 0.57559, 0.392412, 0.286636, 0.144328, -0.008659, -0.014042],
  S21: [0.470641, 0.517795, 0.566041, 0.614699, 0.66738, 0.462889, 0.350693, 0.227783, 0.179689, 0.109061],
};

/**
 * Appendix 1, "Split": the total across every hand the split produces, in units of the
 * opening bet.
 *
 * These are the one place the table and this engine model something different, and the
 * difference is legible in the numbers. Appendix 1 resplits a redrawn pair *whenever it
 * can*; `actionEvs` resplits only when resplitting is worth more than playing the pair as
 * a hand, because that is what a player actually does. The two agree to better than
 * 0.0005 on every cell the published chart splits, and the engine's number is never lower
 * — see the tests below, which assert both halves of that.
 */
const APPENDIX_1_SPLIT: Table = {
  "2": [-0.084336, -0.01565, 0.059088, 0.151665, 0.22689, 0.006743, -0.176693, -0.386883, -0.507175, -0.43357],
  "3": [-0.13771, -0.056273, 0.029932, 0.126284, 0.201318, -0.053043, -0.231843, -0.436607, -0.553507, -0.482405],
  "4": [-0.192325, -0.108712, -0.020395, 0.081913, 0.151377, -0.166452, -0.326068, -0.511152, -0.625044, -0.560206],
  "5": [-0.290154, -0.208718, -0.119335, -0.019231, 0.045404, -0.293928, -0.454237, -0.634113, -0.729969, -0.668811],
  "6": [-0.21256, -0.119715, -0.02132, 0.080912, 0.153668, -0.264427, -0.425122, -0.610576, -0.716103, -0.653362],
  "7": [-0.131478, -0.043733, 0.049255, 0.146678, 0.247385, -0.050148, -0.391981, -0.577584, -0.657268, -0.651641],
  "8": [0.073852, 0.146187, 0.220849, 0.297475, 0.409329, 0.321042, -0.022736, -0.387228, -0.480686, -0.372535],
  "9": [0.195625, 0.258548, 0.323474, 0.391987, 0.471339, 0.364837, 0.234447, -0.07801, -0.317336, -0.13681],
  "10": [0.134774, 0.212836, 0.293403, 0.380367, 0.468117, 0.296633, 0.064443, -0.206733, -0.371278, -0.249494],
  A: [0.470641, 0.517795, 0.566041, 0.614699, 0.66738, 0.462889, 0.350693, 0.227783, 0.179689, 0.109061],
};

/** Appendix 2A / 2B rows: totals 17, 18, 19, 20, 21, then bust. 2B adds blackjack. */
const APPENDIX_2A_1D_S17: Table = {
  A: [0.183786, 0.19089, 0.18868, 0.191692, 0.075137, 0.169815],
  "2": [0.138976, 0.131762, 0.131815, 0.123948, 0.120526, 0.352973],
  "3": [0.130313, 0.130946, 0.123761, 0.123345, 0.116047, 0.375588],
  "4": [0.130973, 0.114163, 0.120679, 0.116286, 0.115096, 0.402803],
  "5": [0.119687, 0.123483, 0.116909, 0.104694, 0.106321, 0.428905],
  "6": [0.166948, 0.106454, 0.107192, 0.100705, 0.097879, 0.420823],
  "7": [0.372345, 0.138583, 0.077334, 0.078897, 0.072987, 0.259854],
  "8": [0.130857, 0.362989, 0.129445, 0.06829, 0.069791, 0.238627],
  "9": [0.121886, 0.103921, 0.357391, 0.12225, 0.061109, 0.233442],
  "10": [0.124156, 0.122486, 0.124421, 0.356869, 0.03957, 0.232499],
};
const APPENDIX_2A_6D_S17: Table = {
  A: [0.188071, 0.189235, 0.188906, 0.189362, 0.077394, 0.167033],
  "2": [0.139656, 0.134389, 0.13002, 0.124019, 0.118413, 0.353504],
  "3": [0.134296, 0.130539, 0.125226, 0.120817, 0.114928, 0.374194],
  "4": [0.130556, 0.124062, 0.121272, 0.116441, 0.111866, 0.395805],
  "5": [0.121843, 0.122437, 0.117575, 0.111793, 0.107945, 0.418406],
  "6": [0.165707, 0.106194, 0.106431, 0.101551, 0.097276, 0.422842],
  "7": [0.369208, 0.137931, 0.078428, 0.078682, 0.073816, 0.261936],
  "8": [0.12894, 0.359955, 0.128723, 0.069219, 0.06947, 0.243693],
  "9": [0.12031, 0.117348, 0.351854, 0.120368, 0.060877, 0.229242],
  "10": [0.121273, 0.121007, 0.121306, 0.368447, 0.037729, 0.230239],
};
const APPENDIX_2A_6D_H17: Table = {
  A: [0.082842, 0.206593, 0.206757, 0.207262, 0.095264, 0.201281],
  "2": [0.130071, 0.135978, 0.131607, 0.125662, 0.120022, 0.356661],
  "3": [0.1259, 0.13193, 0.126656, 0.122185, 0.116371, 0.376958],
  "4": [0.122458, 0.125405, 0.12262, 0.11783, 0.113217, 0.39847],
  "5": [0.118089, 0.123042, 0.118216, 0.112435, 0.108586, 0.419632],
  "6": [0.115064, 0.114574, 0.115043, 0.110177, 0.105882, 0.439259],
  "7": [0.369208, 0.137931, 0.078428, 0.078682, 0.073816, 0.261936],
  "8": [0.12894, 0.359955, 0.128723, 0.069219, 0.06947, 0.243693],
  "9": [0.12031, 0.117348, 0.351854, 0.120368, 0.060877, 0.229242],
  "10": [0.121273, 0.121007, 0.121306, 0.368447, 0.037729, 0.230239],
};
const APPENDIX_2B_6D_S17: Table = {
  A: [0.130017, 0.130822, 0.130594, 0.13091, 0.0535035, 0.115473, 0.308682],
  "2": [0.139656, 0.134389, 0.13002, 0.124019, 0.118413, 0.353504, 0],
  "3": [0.134296, 0.130539, 0.125226, 0.120817, 0.114928, 0.374194, 0],
  "4": [0.130556, 0.124062, 0.121272, 0.116441, 0.111866, 0.395805, 0],
  "5": [0.121843, 0.122437, 0.117575, 0.111793, 0.107945, 0.418406, 0],
  "6": [0.165707, 0.106194, 0.106431, 0.101551, 0.0972756, 0.422842, 0],
  "7": [0.369208, 0.137931, 0.078428, 0.0786816, 0.0738158, 0.261936, 0],
  "8": [0.12894, 0.359955, 0.128723, 0.0692189, 0.0694701, 0.243693, 0],
  "9": [0.12031, 0.117348, 0.351854, 0.120368, 0.0608772, 0.229242, 0],
  "10": [0.111914, 0.111669, 0.111945, 0.340014, 0.0348174, 0.212471, 0.0771704],
};
const APPENDIX_2B_6D_H17: Table = {
  A: [0.0572705, 0.142822, 0.142935, 0.143284, 0.0658578, 0.139149, 0.308682],
  "2": [0.130071, 0.135978, 0.131607, 0.125662, 0.120022, 0.356661, 0],
  "3": [0.1259, 0.13193, 0.126656, 0.122185, 0.116371, 0.376958, 0],
  "4": [0.122458, 0.125405, 0.12262, 0.11783, 0.113217, 0.39847, 0],
  "5": [0.118089, 0.123042, 0.118216, 0.112435, 0.108586, 0.419632, 0],
  "6": [0.115064, 0.114574, 0.115043, 0.110177, 0.105882, 0.439259, 0],
  "7": [0.369208, 0.137931, 0.078428, 0.0786816, 0.0738158, 0.261936, 0],
  "8": [0.12894, 0.359955, 0.128723, 0.0692189, 0.0694701, 0.243693, 0],
  "9": [0.12031, 0.117348, 0.351854, 0.120368, 0.0608772, 0.229242, 0],
  "10": [0.111914, 0.111669, 0.111945, 0.340014, 0.0348174, 0.212471, 0.0771704],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const card = (rank: Rank, suit: Card["suit"] = "s"): Card => ({ rank, suit });

const hand = (ranks: readonly Rank[], fromSplit = false): Hand =>
  createHand(
    ranks.map((rank, index) => card(rank, index === 0 ? "s" : "h")),
    10,
    fromSplit,
  );

/** The ten distinct card values, as the ranks a chart column is labelled with. */
const SLOT_RANKS: readonly Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

/** A neutral shoe: freshly shuffled, with only the cards on the table taken out of it. */
const neutral = (rules: RuleSet, cards: readonly Card[]) =>
  compositionWithout(fullShoeComposition(rules.decks), cards);

/**
 * Enough decks that removing a card moves a probability by about one part in fifty
 * million — an infinite deck, for every purpose Appendix 1 needs one for.
 */
const INFINITE_DECKS = 1_000_000;

/**
 * Appendix 1's rule set, as the page states it. `decks` is along for the ride: no rule the
 * EV path reads is a function of it, and the composition handed in is what actually
 * decides how the cards are distributed.
 */
const APPENDIX_1_RULES: RuleSet = {
  ...DEFAULT_RULES,
  decks: 8,
  dealerSoft17: "stand",
  doubleRule: "any",
  doubleAfterSplit: true,
  surrender: "none",
  maxSplitHands: 4,
  resplitAces: false,
  oneCardToSplitAces: true,
  dealerPeek: true,
};

const infinite = (cards: readonly Card[]) =>
  compositionWithout(fullShoeComposition(INFINITE_DECKS), cards);

/** Two-card hands with each hard total. Hard 20 is only ever a pair of tens. */
const HARD_HANDS: Readonly<Record<number, readonly Rank[]>> = {
  4: ["2", "2"], 5: ["2", "3"], 6: ["2", "4"], 7: ["2", "5"], 8: ["2", "6"],
  9: ["2", "7"], 10: ["2", "8"], 11: ["2", "9"], 12: ["2", "10"], 13: ["3", "10"],
  14: ["4", "10"], 15: ["5", "10"], 16: ["6", "10"], 17: ["7", "10"], 18: ["8", "10"],
  19: ["9", "10"], 20: ["10", "10"],
};

/** Two-card hands with each soft total. */
const SOFT_HANDS: Readonly<Record<number, readonly Rank[]>> = {
  12: ["A", "A"], 13: ["A", "2"], 14: ["A", "3"], 15: ["A", "4"], 16: ["A", "5"],
  17: ["A", "6"], 18: ["A", "7"], 19: ["A", "8"], 20: ["A", "9"], 21: ["10", "A"],
};

/**
 * A two-card hand holding exactly this total.
 *
 * Soft 21 is the awkward one: two cards totalling a soft 21 face up is a natural, and a
 * natural has nothing left to decide, so `legalActions` — correctly — offers nothing. The
 * same two cards arriving from a split are a plain 21, which is the hand Appendix 1's
 * "soft 21" row is actually about.
 */
function totalHand(total: number, soft: boolean): Hand {
  if (soft && total === 21) return hand(SOFT_HANDS[21] as readonly Rank[], true);
  const ranks = (soft ? SOFT_HANDS : HARD_HANDS)[total];
  if (!ranks) throw new Error(`No two-card hand was listed for ${soft ? "soft" : "hard"} ${total}.`);
  return hand(ranks);
}

/** Parses an Appendix 1 row label: "16" is hard 16, "S18" is soft 18. */
function labelToTotal(label: string): { total: number; soft: boolean } {
  return label.startsWith("S")
    ? { total: Number(label.slice(1)), soft: true }
    : { total: Number(label), soft: false };
}

/** Every EV for one hand against every upcard, under Appendix 1's infinite deck. */
function appendix1Evs(playerHand: Hand): ActionEvs[] {
  return UPCARDS.map((rank) => {
    const upcard = card(rank, "d");
    return actionEvs(
      playerHand,
      upcard,
      APPENDIX_1_RULES,
      infinite([...playerHand.cards, upcard]),
    );
  });
}

/**
 * One numeric comparison, labelled so a failure names what it was looking at rather than
 * printing two bare floats. On success both sides read as the published value; on failure
 * the left side shows what the engine produced instead.
 */
function expectClose(label: string, got: number | undefined, want: number, tolerance: number): void {
  const within = got !== undefined && Math.abs(got - want) <= tolerance;
  expect(`${label} = ${within ? want.toFixed(6) : (got?.toFixed(6) ?? "missing")}`).toBe(
    `${label} = ${want.toFixed(6)}`,
  );
}

/**
 * Compares one row against its published counterpart a cell at a time.
 *
 * The tolerance is 0.0005 — half of the 0.001 the issue asks for, so the assertion has
 * somewhere to go before it becomes a judgement call.
 */
function expectRow(
  actual: readonly (number | undefined)[],
  published: readonly number[],
  label: string,
  tolerance = 0.0005,
): void {
  UPCARDS.forEach((rank, index) => {
    expectClose(`${label} vs ${rank}`, actual[index], published[index] as number, tolerance);
  });
}

// ---------------------------------------------------------------------------
// Appendix 2A / 2B — dealer final-hand probabilities
// ---------------------------------------------------------------------------

const DEALER_TABLES = [
  { name: "1 deck, S17, after the peek", table: APPENDIX_2A_1D_S17, decks: 1, soft17: "stand", peek: true },
  { name: "6 decks, S17, after the peek", table: APPENDIX_2A_6D_S17, decks: 6, soft17: "stand", peek: true },
  { name: "6 decks, H17, after the peek", table: APPENDIX_2A_6D_H17, decks: 6, soft17: "hit", peek: true },
  { name: "6 decks, S17, no peek", table: APPENDIX_2B_6D_S17, decks: 6, soft17: "stand", peek: false },
  { name: "6 decks, H17, no peek", table: APPENDIX_2B_6D_H17, decks: 6, soft17: "hit", peek: false },
] as const;

describe.each(DEALER_TABLES)("dealer odds — $name", ({ table, decks, soft17, peek }) => {
  const rules: RuleSet = {
    ...DEFAULT_RULES,
    decks,
    dealerSoft17: soft17,
    dealerPeek: peek,
  };

  for (const [rank, published] of Object.entries(table)) {
    it(`dealer ${rank}`, () => {
      const upcard = card(rank as Rank, "d");
      const outcomes = dealerOutcomes(upcard, rules, neutral(rules, [upcard]));

      DEALER_TOTALS.forEach((total, index) => {
        expectClose(
          `${rank} up, dealer ${total}`,
          outcomes.totals[total],
          published[index] as number,
          0.00001,
        );
      });
      expectClose(`${rank} up, dealer busts`, outcomes.bust, published[5] as number, 0.00001);
      // 2B carries a seventh column; 2A has already conditioned the natural away.
      expectClose(`${rank} up, natural`, outcomes.blackjack, published[6] ?? 0, 0.00001);
    });
  }

  it("every outcome together accounts for the whole hand", () => {
    for (const rank of UPCARDS) {
      const upcard = card(rank, "d");
      const outcomes = dealerOutcomes(upcard, rules, neutral(rules, [upcard]));
      const sum =
        DEALER_TOTALS.reduce((total, key) => total + outcomes.totals[key], 0) +
        outcomes.bust +
        outcomes.blackjack;
      expect(sum).toBeCloseTo(1, 12);
    }
  });
});

describe("dealer odds — rule sensitivity", () => {
  const stands: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand" };
  const hits: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "hit" };

  it("S17 and H17 differ only where the dealer can hold a soft 17", () => {
    // A soft 17 needs an ace counted as 11 and six more points, so an upcard of 7 or
    // better cannot be part of one. The published tables print those columns identically.
    for (const rank of ["7", "8", "9", "10"] as Rank[]) {
      const upcard = card(rank, "d");
      const under17 = dealerOutcomes(upcard, stands, neutral(stands, [upcard]));
      const over17 = dealerOutcomes(upcard, hits, neutral(hits, [upcard]));
      expect(over17.bust).toBeCloseTo(under17.bust, 12);
    }
    for (const rank of ["A", "2", "3", "4", "5", "6"] as Rank[]) {
      const upcard = card(rank, "d");
      const under17 = dealerOutcomes(upcard, stands, neutral(stands, [upcard]));
      const over17 = dealerOutcomes(upcard, hits, neutral(hits, [upcard]));
      expect(over17.bust).toBeGreaterThan(under17.bust);
    }
  });

  it("the peek removes the dealer's natural and renormalises what is left", () => {
    const peeking: RuleSet = { ...DEFAULT_RULES, dealerPeek: true };
    const blind: RuleSet = { ...DEFAULT_RULES, dealerPeek: false };
    const upcard = card("A", "d");
    const after = dealerOutcomes(upcard, peeking, neutral(peeking, [upcard]));
    const before = dealerOutcomes(upcard, blind, neutral(blind, [upcard]));

    expect(after.blackjack).toBe(0);
    // Six decks: 96 tens among the 311 cards the player cannot see.
    expect(before.blackjack).toBeCloseTo(96 / 311, 12);
    expect(after.bust).toBeCloseTo(before.bust / (1 - before.blackjack), 12);
  });
});

// ---------------------------------------------------------------------------
// Appendix 1 — expected values against an infinite deck
// ---------------------------------------------------------------------------

describe("Appendix 1 — standing", () => {
  for (const [label, published] of Object.entries(APPENDIX_1_STAND)) {
    const total = Number(label);
    it(`stand on ${total}${total === 16 ? " (the published 0-16 row)" : ""}`, () => {
      const playerHand = totalHand(total, total === 21);
      expectRow(
        appendix1Evs(playerHand).map((evs) => evs.stand),
        published,
        `stand ${total}`,
      );
    });
  }

  it("every total of 16 or less stands for the same value", () => {
    // Nothing under 17 beats anything the dealer stands on, so the only winning branch is
    // a dealer bust. The published table prints one "0-16" row for exactly this reason.
    const sixteen = appendix1Evs(totalHand(16, false)).map((evs) => evs.stand);
    for (const total of [12, 13, 14, 15]) {
      expectRow(appendix1Evs(totalHand(total, false)).map((evs) => evs.stand), sixteen as number[], `stand ${total}`);
    }
  });
});

describe("Appendix 1 — hitting", () => {
  for (const [label, published] of Object.entries(APPENDIX_1_HIT)) {
    const { total, soft } = labelToTotal(label);
    it(`hit ${soft ? "soft" : "hard"} ${total}`, () => {
      expectRow(
        appendix1Evs(totalHand(total, soft)).map((evs) => evs.hit),
        published,
        `hit ${label}`,
      );
    });
  }
});

describe("Appendix 1 — doubling", () => {
  for (const [label, published] of Object.entries(APPENDIX_1_DOUBLE)) {
    const { total, soft } = labelToTotal(label);
    it(`double ${soft ? "soft" : "hard"} ${total}`, () => {
      expectRow(
        appendix1Evs(totalHand(total, soft)).map((evs) => evs.double),
        published,
        `double ${label}`,
      );
    });
  }
});

describe("Appendix 1 — splitting", () => {
  for (const [rank, published] of Object.entries(APPENDIX_1_SPLIT)) {
    const pair = hand([rank as Rank, rank as Rank]);

    it(`split ${rank},${rank} matches on every cell the chart splits`, () => {
      UPCARDS.forEach((upRank, index) => {
        const upcard = card(upRank, "d");
        if (basicStrategy(pair, upcard, APPENDIX_1_RULES) !== "split") return;
        const evs = actionEvs(
          pair,
          upcard,
          APPENDIX_1_RULES,
          infinite([...pair.cards, upcard]),
        );
        expectClose(
          `split ${rank},${rank} vs ${upRank}`,
          evs.split,
          published[index] as number,
          0.0005,
        );
      });
    });

    it(`split ${rank},${rank} is never worse than the published forced resplit`, () => {
      // Appendix 1 resplits a redrawn pair whenever the table allows it. Choosing whether
      // to resplit can only do better, so the engine's number is an upper bound on the
      // published one — and where resplitting is the right play, the two coincide.
      UPCARDS.forEach((upRank, index) => {
        const upcard = card(upRank, "d");
        const evs = actionEvs(
          pair,
          upcard,
          APPENDIX_1_RULES,
          infinite([...pair.cards, upcard]),
        );
        expect(evs.split).toBeGreaterThanOrEqual((published[index] as number) - 0.0005);
      });
    });
  }

  it("splitting aces is worth the same as doubling a hard 11", () => {
    // Both stake two units on two cards, and A + x covers exactly the totals 12 through 21
    // that 11 + x does. The published table prints identical rows for A,A and double 11.
    const aces = hand(["A", "A"]);
    const eleven = totalHand(11, false);
    UPCARDS.forEach((rank) => {
      const upcard = card(rank, "d");
      const split = actionEvs(aces, upcard, APPENDIX_1_RULES, infinite([...aces.cards, upcard]));
      const double = actionEvs(
        eleven,
        upcard,
        APPENDIX_1_RULES,
        infinite([...eleven.cards, upcard]),
      );
      expect(split.split).toBeCloseTo(double.double as number, 6);
    });
  });
});

// ---------------------------------------------------------------------------
// The cross-check: the highest-EV action against the published chart
// ---------------------------------------------------------------------------

/**
 * Where an exact, per-composition EV correctly disagrees with a total-dependent chart.
 *
 * A published Basic Strategy chart is indexed by a *total*. This module is indexed by the
 * actual cards, and in a short shoe the two are not the same question: a 12 made of 10,2
 * has already taken a ten out of the pack, so hitting it busts less often than hitting a
 * 12 made of 4,8. Wizard of Odds states the phenomenon in the page cited at the top of
 * this file, with one of the entries below as the worked example:
 *
 *   *"all things considered it is better to stand than to hit a 13 against a dealer 2.
 *   However with a 10 and 3 against a dealer 2 it is better to hit."*
 *
 * Every entry here is one of those, and each is worth no more than a fiftieth of a bet —
 * `maxGap` below holds that line, so a genuine chart bug (which costs far more) cannot
 * hide in this list. Anything not listed must agree exactly.
 */
const COMPOSITION_DEPENDENT_EXCEPTIONS: readonly string[] = [
  // Hard 15 vs 10 is the marginal surrender. Made of 7,8 it holds two cards the dealer
  // wants, and hitting edges ahead of giving up half the bet — by half a thousandth.
  "6D H17 DAS LS · 7,8 vs 10",
  "6D S17 DAS LS · 7,8 vs 10",
  // Soft 18 vs 2 is a double-or-stand cell; with the 7 already gone, standing wins.
  "2D H17 DAS · A,7 vs 2",
  // Hard 12 vs 3 hits by the chart. Built from two middling cards it does not: those are
  // the cards that turn a 12 into something worth standing on.
  "2D H17 DAS · 4,8 vs 3",
  "2D H17 DAS · 5,7 vs 3",
  "1D S17 DAS · 3,9 vs 3",
  "1D S17 DAS · 4,8 vs 3",
  "1D S17 DAS · 5,7 vs 3",
  // Two 7s out of a double deck leave few left to split into, so 7,7 vs 8 hits instead.
  "2D H17 DAS · 7,7 vs 8",
  // Single deck, soft 19 vs 6 is the S17 double; holding the 8 takes the edge off it.
  "1D S17 DAS · A,8 vs 6",
  // Hard 8 made of 2,6 vs a small card — the 6 is one of the cards the double wants.
  "1D S17 DAS · 2,6 vs 5",
  "1D S17 DAS · 2,6 vs 6",
  // The two the Wizard's page names: a stiff holding a ten hits, because the ten it holds
  // is one fewer ten left to bust it with.
  "1D S17 DAS · 2,10 vs 4",
  "1D S17 DAS · 3,10 vs 2",
];

/** Every two-card hand, as the ten distinct card values pair up: 55 of them. */
const TWO_CARD_HANDS: readonly Rank[][] = SLOT_RANKS.flatMap((first, index) =>
  SLOT_RANKS.slice(index).map((second) => [first, second]),
);

describe.each(REFERENCE_CHARTS)(
  "$name — the highest-EV action at a neutral count",
  (reference) => {
    const rules = reference.rules;

    for (const ranks of TWO_CARD_HANDS) {
      it(`${ranks.join(",")}`, () => {
        for (const upRank of UPCARDS) {
          const playerHand = hand(ranks);
          const upcard = card(upRank, "d");
          const evs = actionEvs(
            playerHand,
            upcard,
            rules,
            neutral(rules, [...playerHand.cards, upcard]),
          );
          if (Object.keys(evs).length === 0) continue;

          const chartAction = basicStrategy(playerHand, upcard, rules);
          const label = `${reference.name} · ${ranks.join(",")} vs ${upRank}`;
          if (COMPOSITION_DEPENDENT_EXCEPTIONS.includes(label)) {
            expect(`${label}: ${bestAction(evs)}`).not.toBe(`${label}: ${chartAction}`);
            expect(evLoss(evs, chartAction)).toBeLessThan(0.02);
          } else {
            expect(`${label}: ${bestAction(evs)}`).toBe(`${label}: ${chartAction}`);
          }
        }
      });
    }
  },
);

describe("the chart cross-check", () => {
  it("lists no exception that has stopped being one", () => {
    // A stale entry would quietly excuse a cell that now agrees, which is the one way this
    // list could hide a regression rather than document one.
    const stale: string[] = [];
    for (const reference of REFERENCE_CHARTS) {
      for (const ranks of TWO_CARD_HANDS) {
        for (const upRank of UPCARDS) {
          const label = `${reference.name} · ${ranks.join(",")} vs ${upRank}`;
          if (!COMPOSITION_DEPENDENT_EXCEPTIONS.includes(label)) continue;
          const playerHand = hand(ranks);
          const upcard = card(upRank, "d");
          const evs = actionEvs(
            playerHand,
            upcard,
            reference.rules,
            neutral(reference.rules, [...playerHand.cards, upcard]),
          );
          if (bestAction(evs) === basicStrategy(playerHand, upcard, reference.rules)) {
            stale.push(label);
          }
        }
      }
    }
    expect(stale).toEqual([]);
  });

  it("agrees with the chart on the cells competitors get wrong", () => {
    // The three regressions `strategy.test.ts` calls out, checked here from the other
    // direction: the EV, not the chart, says so.
    const rules = DEFAULT_RULES;
    const check = (ranks: Rank[], upRank: Rank, expected: string) => {
      const playerHand = hand(ranks);
      const upcard = card(upRank, "d");
      const evs = actionEvs(
        playerHand,
        upcard,
        rules,
        neutral(rules, [...playerHand.cards, upcard]),
      );
      expect(`${ranks.join(",")} vs ${upRank}: ${bestAction(evs)}`).toBe(
        `${ranks.join(",")} vs ${upRank}: ${expected}`,
      );
    };

    // A pair of 9s is not "always stand".
    check(["9", "9"], "2", "split");
    check(["9", "9"], "6", "split");
    check(["9", "9"], "8", "split");
    check(["9", "9"], "9", "split");
    check(["9", "9"], "7", "stand");
    // Soft 18 is not "always stand" either.
    check(["A", "7"], "9", "hit");
    check(["A", "7"], "10", "hit");
    check(["A", "7"], "6", "double");
    // A,A always splits.
    for (const upRank of UPCARDS) check(["A", "A"], upRank, "split");
  });
});

// ---------------------------------------------------------------------------
// Composition dependence — the whole point of computing against a real shoe
// ---------------------------------------------------------------------------

/** The four ranks that share the ten slot. Removing "tens" means removing all four. */
const TEN_RANKS: readonly Rank[] = ["10", "J", "Q", "K"];

/** A six-deck shoe with `removed` cards of each of the given ranks taken out. */
function depleted(ranks: readonly Rank[], removed: number, alsoOut: readonly Card[]) {
  const counts = { ...fullShoeComposition(6) } as Record<Rank, number>;
  for (const rank of ranks) counts[rank] -= removed;
  return compositionWithout(counts, alsoOut);
}

describe("composition dependence — 16 against a ten", () => {
  const sixteen = hand(["9", "7"]);
  const upcard = card("10", "d");
  const rules: RuleSet = { ...DEFAULT_RULES, surrender: "none" };
  const onTable = [...sixteen.cards, upcard];

  const evsWithTensRemoved = (perRank: number) =>
    actionEvs(sixteen, upcard, rules, depleted(TEN_RANKS, perRank, onTable));

  it("hits at a neutral count and stands once the shoe is rich in tens", () => {
    expect(bestAction(evsWithTensRemoved(0))).toBe("hit");
    // Six fewer tens of each rank is twenty-four tens gone; six more is twenty-four extra.
    expect(bestAction(evsWithTensRemoved(6))).toBe("hit");
    expect(bestAction(evsWithTensRemoved(-6))).toBe("stand");
  });

  it("moves monotonically: every ten removed makes hitting look better", () => {
    // This is the direction the arithmetic actually runs, and it is the opposite of the
    // intuition people usually reach for. Standing on 16 only ever wins when the dealer
    // busts, and a ten-poor shoe is a shoe where a stiff dealer *survives*. Taking tens
    // out therefore hurts standing and helps hitting at once, which is why the famous
    // index for 16 vs 10 is a *positive*-count deviation.
    let previous = -Infinity;
    for (const perRank of [-6, -4, -2, 0, 2, 4, 6]) {
      const evs = evsWithTensRemoved(perRank);
      const margin = (evs.hit as number) - (evs.stand as number);
      expect(margin).toBeGreaterThan(previous);
      previous = margin;
    }
  });

  it("flips at a small positive true count, near the published index of 0", () => {
    // The Illustrious 18 quotes 16 vs 10 at a Hi-Lo index of 0: stand once the count turns
    // positive. Depleting low cards is how a count actually turns positive, so that is what
    // this does, rather than conjuring tens out of nowhere.
    const LOW_RANKS: readonly Rank[] = ["2", "3", "4", "5", "6"];
    let flippedAt: number | null = null;
    for (let perRank = 0; perRank <= 6 && flippedAt === null; perRank++) {
      const evs = actionEvs(sixteen, upcard, rules, depleted(LOW_RANKS, perRank, onTable));
      if (bestAction(evs) === "stand") {
        const removed = LOW_RANKS.flatMap((rank) =>
          Array.from({ length: perRank }, () => card(rank)),
        );
        const running = currentRunningCount(removed, HI_LO, 6);
        flippedAt = trueCount(running, (312 - removed.length - 3) / 52, "exact");
      }
    }
    expect(flippedAt).not.toBeNull();
    expect(flippedAt as number).toBeGreaterThan(0);
    expect(flippedAt as number).toBeLessThan(3);
  });
});

describe("composition dependence — other counts that move a play", () => {
  const rules = DEFAULT_RULES;

  it("insurance-grade ten density lifts the EV of standing on a stiff", () => {
    const stiff = hand(["10", "5"]);
    const upcard = card("6", "d");
    const onTable = [...stiff.cards, upcard];
    const rich = actionEvs(stiff, upcard, rules, depleted(["10", "J", "Q", "K"], -6, onTable));
    const poor = actionEvs(stiff, upcard, rules, depleted(["10", "J", "Q", "K"], 6, onTable));
    expect(rich.stand as number).toBeGreaterThan(poor.stand as number);
  });

  it("doubling a hard 11 tracks the ten density, because 11 wants exactly a ten", () => {
    const eleven = hand(["6", "5"]);
    const upcard = card("6", "d");
    const onTable = [...eleven.cards, upcard];
    const rich = actionEvs(eleven, upcard, rules, depleted(TEN_RANKS, -6, onTable));
    const poor = actionEvs(eleven, upcard, rules, depleted(TEN_RANKS, 6, onTable));
    expect(rich.double as number).toBeGreaterThan(poor.double as number);
  });

  it("splitting aces is worth more when there are tens left to land on them", () => {
    const aces = hand(["A", "A"]);
    const upcard = card("6", "d");
    const onTable = [...aces.cards, upcard];
    const rich = actionEvs(aces, upcard, rules, depleted(TEN_RANKS, -6, onTable));
    const poor = actionEvs(aces, upcard, rules, depleted(TEN_RANKS, 6, onTable));
    expect(rich.split as number).toBeGreaterThan(poor.split as number);
  });

  it("an ace-rich shoe is worth *less* to a hard 11 than a ten-rich one", () => {
    // Worth pinning down, because it cuts against the reflex that aces are good for the
    // player. They are good for the *shoe* — they make naturals — but to a hand of 11 an
    // ace is a 12, and every extra ace is one fewer ten in the pack.
    const eleven = hand(["6", "5"]);
    const upcard = card("6", "d");
    const onTable = [...eleven.cards, upcard];
    const aceRich = actionEvs(eleven, upcard, rules, depleted(["A"], -8, onTable));
    const acePoor = actionEvs(eleven, upcard, rules, depleted(["A"], 8, onTable));
    expect(aceRich.double as number).toBeLessThan(acePoor.double as number);
  });

  it("a shoe with no tens left never busts a hit on 16", () => {
    const sixteen = hand(["9", "7"]);
    const upcard = card("9", "d");
    const noTens = depleted(["10", "J", "Q", "K"], 24, [...sixteen.cards, upcard]);
    const evs = actionEvs(sixteen, upcard, rules, noTens);
    expect(bestAction(evs)).toBe("hit");
    // Every remaining card takes 16 to 17-21, so hitting cannot lose to a bust.
    expect(evs.hit as number).toBeGreaterThan(evs.stand as number);
  });
});

// ---------------------------------------------------------------------------
// Agreement with the rest of the engine
// ---------------------------------------------------------------------------

describe("agreement with hand.ts", () => {
  it("counts every three- and four-card hand the same way `evaluate` does", () => {
    // `evaluate` demotes aces from the whole hand at once; the EV solver reaches the same
    // total one card at a time, and the two have to agree. Standing EV is a pure function
    // of the total, so a hand and the two-card hand `evaluate` says it ties must be worth
    // exactly the same against one shoe. Aces are where an incremental demotion goes
    // wrong, so this walks every hand of three and four cards rather than sampling.
    const rules: RuleSet = { ...DEFAULT_RULES, surrender: "none" };
    const upcard = card("7", "d");
    const composition = fullShoeComposition(6);
    const standEvFor = (ranks: readonly Rank[]) =>
      actionEvs(hand(ranks), upcard, rules, composition).stand;

    const reference = new Map<string, number | undefined>();
    for (const soft of [false, true]) {
      for (const total of Object.keys(soft ? SOFT_HANDS : HARD_HANDS).map(Number)) {
        reference.set(
          `${total}${soft ? "s" : "h"}`,
          actionEvs(totalHand(total, soft), upcard, rules, composition).stand,
        );
      }
    }

    /** Every multiset of `size` cards drawn from the ten distinct values. */
    const multisets = (size: number, from = 0): Rank[][] =>
      size === 0
        ? [[]]
        : SLOT_RANKS.slice(from).flatMap((rank, offset) =>
            multisets(size - 1, from + offset).map((rest) => [rank, ...rest]),
          );

    let checked = 0;
    for (const size of [3, 4]) {
      for (const ranks of multisets(size)) {
        const value = evaluate(ranks.map((rank) => card(rank)));
        if (value.busted) continue;
        const want = reference.get(`${value.total}${value.soft ? "s" : "h"}`);
        if (want === undefined) continue; // hard 21 has no two-card counterpart
        expectClose(
          `${ranks.join(",")} stands as ${value.soft ? "soft " : ""}${value.total}`,
          standEvFor(ranks),
          want,
          1e-12,
        );
        checked++;
      }
    }
    // A fixed count, so a loop that quietly stopped enumerating would fail rather than pass.
    expect(checked).toBe(462);
  });

  it("offers an EV for exactly the actions `legalActions` offers", () => {
    const rules = DEFAULT_RULES;
    const upcard = card("6", "d");
    const cases: { ranks: Rank[]; fromSplit?: boolean; expected: string[] }[] = [
      { ranks: ["10", "6"], expected: ["hit", "stand", "double", "surrender"] },
      { ranks: ["8", "8"], expected: ["hit", "stand", "double", "split", "surrender"] },
      { ranks: ["10", "6", "2"], expected: ["hit", "stand"] },
      { ranks: ["8", "8"], fromSplit: true, expected: ["hit", "stand", "double", "split"] },
    ];
    for (const { ranks, fromSplit, expected } of cases) {
      const playerHand = hand(ranks, fromSplit);
      const evs = actionEvs(playerHand, upcard, rules, neutral(rules, [...playerHand.cards, upcard]));
      expect(Object.keys(evs).sort()).toEqual([...expected].sort());
    }
  });

  it("has nothing to say about a hand with nothing left to decide", () => {
    const rules = DEFAULT_RULES;
    const upcard = card("6", "d");
    const composition = fullShoeComposition(6);
    // A natural, a busted hand, and a split ace holding its one card.
    expect(actionEvs(hand(["A", "10"]), upcard, rules, composition)).toEqual({});
    expect(actionEvs(hand(["10", "9", "5"]), upcard, rules, composition)).toEqual({});
    expect(actionEvs(hand(["A", "9"], true), upcard, rules, composition)).toEqual({});
  });

  it("plays the dealer out the way `round.ts` does", () => {
    // `round.ts` owns the real dealer. Deal thousands of seeded rounds, stand at once so
    // the dealer always draws, and the totals that come back have to land where
    // `dealerOutcomes` says they will. A drawing rule that drifted apart from the round's
    // would show up here long before a user found it.
    const rules: RuleSet = { ...DEFAULT_RULES, surrender: "none" };
    const tally = new Map<string, Map<number, number>>();
    const ROUNDS = 40_000;

    for (let seed = 1; seed <= ROUNDS; seed++) {
      let state = startRound({ rules, shoe: createShoe(rules, seed), bet: 10, bankroll: 1000 });
      if (state.phase === "insurance") state = applyAction(state, { type: "insurance", take: false });
      if (state.phase === "settled") continue; // the dealer peeked into a natural
      state = applyAction(state, { type: "stand" });
      const upcard = dealerUpcard(state);
      const slot = upcard.rank === "A" ? "A" : String(Math.min(10, evaluate([upcard]).total));
      const value = evaluate(state.dealerHand.cards);
      const bucket = tally.get(slot) ?? new Map<number, number>();
      const final = value.busted ? 22 : value.total;
      bucket.set(final, (bucket.get(final) ?? 0) + 1);
      tally.set(slot, bucket);
    }

    for (const [slot, bucket] of tally) {
      const upcard = card(slot as Rank, "d");
      const expectedOdds = dealerOutcomes(upcard, rules, neutral(rules, [upcard]));
      const dealt = [...bucket.values()].reduce((sum, n) => sum + n, 0);
      for (const total of DEALER_TOTALS) {
        const seen = (bucket.get(total) ?? 0) / dealt;
        expect(
          `${slot} up, dealer ${total}: ${Math.abs(seen - expectedOdds.totals[total]) < 0.02}`,
        ).toBe(`${slot} up, dealer ${total}: true`);
      }
      const busted = (bucket.get(22) ?? 0) / dealt;
      expect(`${slot} up, bust: ${Math.abs(busted - expectedOdds.bust) < 0.02}`).toBe(
        `${slot} up, bust: true`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Rules, and the money on the table
// ---------------------------------------------------------------------------

describe("rule sensitivity", () => {
  const upcard = card("6", "d");

  it("late surrender is worth exactly half a bet when the dealer cannot have a natural", () => {
    const rules: RuleSet = { ...DEFAULT_RULES, surrender: "late" };
    const sixteen = hand(["10", "6"]);
    const evs = actionEvs(sixteen, upcard, rules, neutral(rules, [...sixteen.cards, upcard]));
    expect(evs.surrender).toBe(-0.5);
  });

  it("without a peek, surrendering late costs more than half a bet and early does not", () => {
    // `round.ts` forfeits the whole opening bet to a late surrender that walks into a
    // natural; early surrender is taken before the dealer ever looks.
    const sixteen = hand(["10", "6"]);
    const ace = card("A", "d");
    const late: RuleSet = { ...DEFAULT_RULES, dealerPeek: false, surrender: "late" };
    const early: RuleSet = { ...DEFAULT_RULES, dealerPeek: false, surrender: "early" };
    const composition = neutral(late, [...sixteen.cards, ace]);

    const lateEv = actionEvs(sixteen, ace, late, composition).surrender as number;
    expect(lateEv).toBeLessThan(-0.5);
    // A ten, a 6 and the ace are on the table, so 95 tens sit among 309 unseen cards —
    // and at those odds half a forfeited bet becomes a whole one.
    expect(lateEv).toBeCloseTo(-0.5 - 0.5 * (95 / 309), 12);
    expect(actionEvs(sixteen, ace, early, composition).surrender).toBe(-0.5);
  });

  it("no peek costs every action the same flat amount", () => {
    const sixteen = hand(["10", "6"]);
    const ace = card("A", "d");
    const peeking: RuleSet = { ...DEFAULT_RULES, dealerPeek: true, surrender: "none" };
    const blind: RuleSet = { ...DEFAULT_RULES, dealerPeek: false, surrender: "none" };
    const composition = neutral(blind, [...sixteen.cards, ace]);
    const after = actionEvs(sixteen, ace, peeking, composition);
    const before = actionEvs(sixteen, ace, blind, composition);

    // Standing and hitting both lose exactly the opening bet to a dealer natural, so the
    // no-peek game is the peeked one blended with a certain loss at the natural's odds.
    const natural = 95 / 309;
    expect(before.stand).toBeCloseTo((1 - natural) * (after.stand as number) - natural, 12);
    expect(before.hit).toBeCloseTo((1 - natural) * (after.hit as number) - natural, 12);
  });

  it("H17 is worse for the player than S17 on a made 18", () => {
    const eighteen = hand(["10", "8"]);
    const ace = card("A", "d");
    const stands: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "stand" };
    const hits: RuleSet = { ...DEFAULT_RULES, dealerSoft17: "hit" };
    const composition = neutral(stands, [...eighteen.cards, ace]);
    expect(actionEvs(eighteen, ace, hits, composition).stand as number).toBeLessThan(
      actionEvs(eighteen, ace, stands, composition).stand as number,
    );
  });

  it("DAS makes splitting worth more, and never less", () => {
    const pair = hand(["2", "2"]);
    const five = card("5", "d");
    const withDas: RuleSet = { ...DEFAULT_RULES, doubleAfterSplit: true };
    const without: RuleSet = { ...DEFAULT_RULES, doubleAfterSplit: false };
    const composition = neutral(withDas, [...pair.cards, five]);
    expect(actionEvs(pair, five, withDas, composition).split as number).toBeGreaterThan(
      actionEvs(pair, five, without, composition).split as number,
    );
  });

  it("resplitting aces is worth more than being stuck with two hands", () => {
    const aces = hand(["A", "A"]);
    const six = card("6", "d");
    const resplits: RuleSet = { ...DEFAULT_RULES, resplitAces: true, oneCardToSplitAces: false };
    const stuck: RuleSet = { ...DEFAULT_RULES, resplitAces: false, oneCardToSplitAces: false };
    const composition = neutral(resplits, [...aces.cards, six]);
    expect(actionEvs(aces, six, resplits, composition).split as number).toBeGreaterThan(
      actionEvs(aces, six, stuck, composition).split as number,
    );
  });

  it("split aces that may draw freely beat split aces frozen on one card", () => {
    const aces = hand(["A", "A"]);
    const six = card("6", "d");
    const frozen: RuleSet = { ...DEFAULT_RULES, oneCardToSplitAces: true };
    const free: RuleSet = { ...DEFAULT_RULES, oneCardToSplitAces: false };
    const composition = neutral(frozen, [...aces.cards, six]);
    expect(actionEvs(aces, six, free, composition).split as number).toBeGreaterThan(
      actionEvs(aces, six, frozen, composition).split as number,
    );
  });

  it("a restricted double rule leaves soft hands and low totals with no double at all", () => {
    const soft17 = hand(["A", "6"]);
    const five = card("5", "d");
    const restricted: RuleSet = { ...DEFAULT_RULES, doubleRule: "10-11" };
    const evs = actionEvs(soft17, five, restricted, neutral(restricted, [...soft17.cards, five]));
    expect(evs.double).toBeUndefined();
  });

  it("the blackjack payout cannot reach a hand that still has a decision to make", () => {
    const sixteen = hand(["10", "6"]);
    const threeTwo: RuleSet = { ...DEFAULT_RULES, blackjackPayout: "3:2" };
    const sixFive: RuleSet = { ...DEFAULT_RULES, blackjackPayout: "6:5" };
    const composition = neutral(threeTwo, [...sixteen.cards, upcard]);
    expect(actionEvs(sixteen, upcard, threeTwo, composition)).toEqual(
      actionEvs(sixteen, upcard, sixFive, composition),
    );
  });
});

// ---------------------------------------------------------------------------
// The Explanation surface
// ---------------------------------------------------------------------------

describe("ranking, verdicts and losses", () => {
  const rules = DEFAULT_RULES;
  const sixteen = hand(["10", "6"]);
  const upcard = card("10", "d");
  const evs = actionEvs(sixteen, upcard, rules, neutral(rules, [...sixteen.cards, upcard]));

  it("ranks every legal action best first", () => {
    const ranked = rankActions(evs);
    expect(ranked.map((entry) => entry.action).sort()).toEqual(Object.keys(evs).sort());
    for (let i = 1; i < ranked.length; i++) {
      expect((ranked[i - 1] as { ev: number }).ev).toBeGreaterThanOrEqual(
        (ranked[i] as { ev: number }).ev,
      );
    }
  });

  it("breaks ties in a fixed order rather than an accidental one", () => {
    const tied: ActionEvs = { hit: -0.5, stand: -0.5, surrender: -0.5, double: -0.5 };
    expect(bestAction(tied)).toBe("stand");
    expect(rankActions(tied).map((entry) => entry.action)).toEqual([
      "stand",
      "hit",
      "surrender",
      "double",
    ]);
  });

  it("reports what a choice cost, and zero for the best play", () => {
    expect(evLoss(evs, bestAction(evs))).toBe(0);
    for (const action of Object.keys(evs) as (keyof typeof evs)[]) {
      expect(evLoss(evs, action)).toBeGreaterThanOrEqual(0);
      expect(evLoss(evs, action)).toBeCloseTo(
        (evs[bestAction(evs)] as number) - (evs[action] as number),
        12,
      );
    }
  });

  it("surrendering a 16 against a ten costs almost nothing, which is why it is close", () => {
    // The Explanation's job is this number, not the verdict. 16 vs 10 is the most argued
    // hand in blackjack precisely because every option is within a few hundredths.
    expect(evLoss(evs, "hit")).toBeLessThan(0.05);
    expect(evLoss(evs, "stand")).toBeLessThan(0.05);
  });

  it("refuses to explain an action the player never had", () => {
    expect(() => evLoss(evs, "split")).toThrow(/not legal/);
    expect(() => bestAction({})).toThrow(/no legal ones/);
  });
});

describe("compositions", () => {
  it("builds a full shoe of the right size", () => {
    const composition = fullShoeComposition(6);
    expect(Object.values(composition).reduce((sum, n) => sum + n, 0)).toBe(312);
    expect(composition["10"] + composition.J + composition.Q + composition.K).toBe(96);
    expect(() => fullShoeComposition(0)).toThrow(/positive integer/);
    expect(() => fullShoeComposition(1.5)).toThrow(/positive integer/);
  });

  it("puts the dealer's hole card back into the pool the dealer draws it from", () => {
    const rules = DEFAULT_RULES;
    const state = startRound({ rules, shoe: createShoe(rules, 7), bet: 10, bankroll: 1000 });
    const hole = state.dealerHand.cards[1] as Card;
    const unseen = unseenComposition(state.shoe, [hole]);
    const remaining = remainingComposition(state.shoe);

    expect(unseen[hole.rank]).toBe(remaining[hole.rank] + 1);
    expect(Object.values(unseen).reduce((sum, n) => sum + n, 0)).toBe(
      Object.values(remaining).reduce((sum, n) => sum + n, 0) + 1,
    );
    // Four cards are on the table; the other 308 are unseen, hole card included.
    expect(Object.values(unseen).reduce((sum, n) => sum + n, 0)).toBe(312 - 3);
    expect(decksRemaining(state.shoe)).toBeCloseTo(308 / 52, 12);
  });

  it("refuses to remove a card the composition does not hold", () => {
    const empty = compositionWithout(fullShoeComposition(1), Array(4).fill(card("A")));
    expect(empty.A).toBe(0);
    expect(() => compositionWithout(empty, [card("A")])).toThrow(/holds none of them/);
  });

  it("leaves the composition it was handed exactly as it found it", () => {
    // The solver draws from a mutable copy of the composition and puts every card back.
    // If a branch ever failed to, the second call would disagree with the first — and a
    // Decision replayed from a Session would stop reproducing (ADR-0002, ADR-0004).
    const rules = DEFAULT_RULES;
    const pair = hand(["8", "8"]);
    const upcard = card("10", "d");
    const composition = neutral(rules, [...pair.cards, upcard]);
    const snapshot = { ...composition };

    const first = actionEvs(pair, upcard, rules, composition);
    const second = actionEvs(pair, upcard, rules, composition);
    expect(composition).toEqual(snapshot);
    expect(second).toEqual(first);
  });

  it("refuses to compute anything against a shoe with no cards in it", () => {
    const rules = DEFAULT_RULES;
    const nothing = Object.fromEntries(Object.keys(fullShoeComposition(1)).map((r) => [r, 0]));
    expect(() =>
      actionEvs(hand(["10", "6"]), card("6"), rules, nothing as Record<Rank, number>),
    ).toThrow(/empty composition/);
  });
});

// ---------------------------------------------------------------------------
// The approximation, measured; and the clock
// ---------------------------------------------------------------------------

/**
 * A representative decision for each shape of hand the solver has to handle: a stiff, a
 * low hard total that draws many times, a soft hand, and the three kinds of pair.
 */
const BENCHMARK_HANDS: readonly { readonly ranks: Rank[]; readonly up: Rank }[] = [
  { ranks: ["10", "6"], up: "10" },
  { ranks: ["10", "2"], up: "10" },
  { ranks: ["2", "3"], up: "10" },
  { ranks: ["4", "4"], up: "6" },
  { ranks: ["A", "6"], up: "6" },
  { ranks: ["8", "8"], up: "10" },
  { ranks: ["2", "2"], up: "5" },
  { ranks: ["A", "A"], up: "A" },
];

describe("the dealer-composition approximation", () => {
  it("moves an EV by less than a fiftieth of what a wrong chart cell would", () => {
    const rules = DEFAULT_RULES;
    let worst = 0;
    for (const { ranks, up } of BENCHMARK_HANDS) {
      const playerHand = hand(ranks);
      const upcard = card(up, "d");
      const composition = neutral(rules, [...playerHand.cards, upcard]);
      const fast = actionEvs(playerHand, upcard, rules, composition);
      const exact = actionEvs(playerHand, upcard, rules, composition, {
        dealerComposition: "after-each-draw",
      });
      for (const action of Object.keys(fast) as (keyof typeof fast)[]) {
        worst = Math.max(worst, Math.abs((fast[action] as number) - (exact[action] as number)));
      }
      // And it never changes the verdict, which is the only thing the user sees.
      expect(`${ranks.join(",")} vs ${up}: ${bestAction(fast)}`).toBe(
        `${ranks.join(",")} vs ${up}: ${bestAction(exact)}`,
      );
    }
    expect(worst).toBeLessThan(0.005);
  });

  it("vanishes entirely when the shoe is big enough not to deplete", () => {
    const playerHand = hand(["10", "6"]);
    const upcard = card("10", "d");
    const composition = infinite([...playerHand.cards, upcard]);
    const fast = actionEvs(playerHand, upcard, APPENDIX_1_RULES, composition);
    const exact = actionEvs(playerHand, upcard, APPENDIX_1_RULES, composition, {
      dealerComposition: "after-each-draw",
    });
    expect(fast.hit).toBeCloseTo(exact.hit as number, 6);
  });
});

describe("benchmark", () => {
  /**
   * Invariant 3 says feedback arrives while the cards are still on screen, so a decision's
   * EVs have to be ready inside a frame. This is the only place in `src/engine` that reads
   * a clock, and it reads it to *measure* the engine rather than to compute with it —
   * nothing here reaches an EV, so ADR-0004's determinism is untouched.
   */
  const clock = () => globalThis.performance.now();

  it("computes every legal action's EV fast enough for a live hint", () => {
    const rules = DEFAULT_RULES;
    const cases = BENCHMARK_HANDS.map(({ ranks, up }) => {
      const playerHand = hand(ranks);
      const upcard = card(up, "d");
      return { playerHand, upcard, composition: neutral(rules, [...playerHand.cards, upcard]), ranks, up };
    });

    // Warm the JIT, then time each hand over enough repeats to be worth timing.
    for (const { playerHand, upcard, composition } of cases) {
      actionEvs(playerHand, upcard, rules, composition);
    }

    const REPEATS = 20;
    const timings = cases.map(({ playerHand, upcard, composition, ranks, up }) => {
      const started = clock();
      for (let i = 0; i < REPEATS; i++) actionEvs(playerHand, upcard, rules, composition);
      return { label: `${ranks.join(",")} vs ${up}`, ms: (clock() - started) / REPEATS };
    });

    const slowest = timings.reduce((worst, entry) => (entry.ms > worst.ms ? entry : worst));
    const report = timings.map((entry) => `${entry.label} ${entry.ms.toFixed(3)}ms`).join(", ");
    console.log(`actionEvs per decision — ${report}`);

    // A frame is 16ms. The budget is deliberately loose because CI machines are not
    // developer laptops; the number that matters is the one printed above.
    expect(`slowest (${slowest.label}) under 50ms: ${slowest.ms < 50}`).toBe(
      `slowest (${slowest.label}) under 50ms: true`,
    );
  });
});
