import { classesMap, classNameToClassId } from "$lib/constants/classes";
import {
    Buff,
    BuffDetails,
    MeterTab,
    StatusEffectBuffTypeFlags,
    StatusEffectTarget,
    type DamageStats,
    type EncounterDamageStats,
    type Entity,
    type Skill,
    type SkillChartSupportDamage,
    type StatusEffect,
    type StatusEffectWithId
} from "$lib/types";
import { round } from "./numbers";
import { getSkillIcon } from "./strings";

export function defaultBuffFilter(buffType: number): boolean {
    return (
        ((StatusEffectBuffTypeFlags.DMG |
            StatusEffectBuffTypeFlags.CRIT |
            StatusEffectBuffTypeFlags.ATKSPEED |
            StatusEffectBuffTypeFlags.MOVESPEED |
            StatusEffectBuffTypeFlags.COOLDOWN) &
            buffType) !==
        0
    );
}

export function groupedSynergiesAdd(
    map: Map<string, Map<number, StatusEffect>>,
    key: string,
    id: number,
    buff: StatusEffect,
    focusedPlayer?: Entity,
    buffFilter = true
) {
    // by default, only show dmg, crit, atk spd, cd buffs.
    // show all arcana cards for fun
    if (!focusedPlayer || focusedPlayer.classId !== 202) {
        if (buffFilter && !defaultBuffFilter(buff.buffType)) {
            return;
        }
    }
    key = key.replaceAll(" ", "").toLowerCase();
    if (map.has(key)) {
        map.get(key)?.set(id, buff);
    } else {
        map.set(key, new Map([[id, buff]]));
    }
}

export function filterStatusEffects(
    groupedSynergies: Map<string, Map<number, StatusEffect>>,
    buff: StatusEffect,
    id: number,
    focusedPlayer?: Entity,
    tab?: MeterTab,
    buffFilter = true,
    shields = false
) {
    let key = "";

    // Party synergies
    if (isPartySynergy(buff)) {
        if (tab !== MeterTab.PARTY_BUFFS && !shields) {
            return;
        }

        if (isSupportBuff(buff)) {
            key = makeSupportBuffKey(buff);
        } else {
            key = `${classesMap[buff.source.skill?.classId ?? 0]}_${
                buff.uniqueGroup ? buff.uniqueGroup : buff.source.skill?.name
            }`;
        }

        groupedSynergiesAdd(groupedSynergies, key, id, buff, focusedPlayer, buffFilter);
    }
    // Self synergies
    else if (isSelfItemSynergy(buff)) {
        if (tab !== MeterTab.SELF_BUFFS && !shields) {
            return;
        }

        if (buff.buffCategory === "bracelet") {
            // put bracelets buffs at the end
            key = `zzbracelet_${buff.uniqueGroup}`;
        } else if (buff.buffCategory === "elixir") {
            key = `elixir_${buff.uniqueGroup}`;
        } else {
            if (buff.buffCategory === "battleitem") {
                key = buff.buffCategory + "_" + id;
            } else {
                key = buff.buffCategory;
            }
        }
        groupedSynergiesAdd(groupedSynergies, key, id, buff, focusedPlayer, buffFilter);
    }
    // set synergies
    else if (isSetSynergy(buff) && buff.source.setName) {
        if ((tab === MeterTab.SELF_BUFFS && !focusedPlayer) || shields) {
            // put set buffs at the start
            groupedSynergiesAdd(groupedSynergies, `_set_${buff.source.setName}`, id, buff, focusedPlayer, buffFilter);
        }
    }
    // self & other identity, class skill, engravings
    else if (isSelfSkillSynergy(buff)) {
        if (tab === MeterTab.SELF_BUFFS && focusedPlayer) {
            if (buff.buffCategory === "ability" || buff.buffCategory === "arkpassive") {
                key = `${buff.uniqueGroup ? buff.uniqueGroup : id}`;
            } else {
                if (focusedPlayer.classId !== buff.source.skill?.classId) {
                    return; // We hide other classes self buffs (class_skill & identity)
                }
                key = `_${classesMap[buff.source.skill?.classId ?? 0]}_${
                    buff.uniqueGroup ? buff.uniqueGroup : buff.source.skill?.name
                }`;
            }
            groupedSynergiesAdd(groupedSynergies, key, id, buff, focusedPlayer, buffFilter);
        } else if (shields) {
            if (isSupportBuff(buff)) {
                key = makeSupportBuffKey(buff);
            } else if (buff.buffCategory === "ability") {
                key += `${buff.uniqueGroup ? buff.uniqueGroup : id}`;
            } else {
                key += `_${classesMap[buff.source.skill?.classId ?? 0]}_${
                    buff.uniqueGroup ? buff.uniqueGroup : buff.source.skill?.name
                }`;
            }
            groupedSynergiesAdd(groupedSynergies, key, id, buff, focusedPlayer, buffFilter);
        }
    }
    // other synergies
    else if (isOtherSynergy(buff)) {
        if ((tab === MeterTab.SELF_BUFFS && focusedPlayer) || shields) {
            groupedSynergiesAdd(groupedSynergies, `etc_${buff.source.name}`, id, buff, focusedPlayer, buffFilter);
        }
    }
}

export function getSynergyPercentageDetails(groupedSynergies: Map<string, Map<number, StatusEffect>>, skill: Skill) {
    const synergyPercentageDetails: BuffDetails[] = [];
    const isHyperAwakening = hyperAwakeningIds.has(skill.id);
    groupedSynergies.forEach((synergies, key) => {
        let synergyDamage = 0;
        const buff = new BuffDetails();
        buff.id = key;

        synergies.forEach((syn, id) => {
            if (isHyperAwakening) {
                if (supportSkills.haTechnique.includes(id)) {
                    const b = new Buff(
                        syn.source.icon,
                        round((skill.buffedBy[id] / skill.totalDamage) * 100),
                        syn.source.skill?.icon
                    );

                    buff.buffs.push(b);
                    synergyDamage += skill.buffedBy[id];
                }

                return;
            }

            if (skill.buffedBy[id]) {
                const b = new Buff(
                    syn.source.icon,
                    round((skill.buffedBy[id] / skill.totalDamage) * 100),
                    syn.source.skill?.icon
                );
                addBardBubbles(key, b, syn);
                buff.buffs.push(b);
                synergyDamage += skill.buffedBy[id];
            } else if (skill.debuffedBy[id]) {
                buff.buffs.push(
                    new Buff(
                        syn.source.icon,
                        round((skill.debuffedBy[id] / skill.totalDamage) * 100),
                        syn.source.skill?.icon
                    )
                );
                synergyDamage += skill.debuffedBy[id];
            }
        });

        if (synergyDamage > 0) {
            buff.percentage = round((synergyDamage / skill.totalDamage) * 100);
        }
        synergyPercentageDetails.push(buff);
    });

    return synergyPercentageDetails;
}

export function getSynergyPercentageDetailsSum(
    groupedSynergies: Map<string, Map<number, StatusEffect>>,
    skills: Skill[],
    damageStats: DamageStats
) {
    const totalDamage = damageStats.damageDealt;
    const totalDamageWithoutHa = totalDamage - (damageStats.hyperAwakeningDamage ?? 0);

    const synergyPercentageDetails: BuffDetails[] = [];
    groupedSynergies.forEach((synergies, key) => {
        let synergyDamage = 0;
        const buffs = new BuffDetails();
        buffs.id = key;
        let isHat = false;
        synergies.forEach((syn, id) => {
            isHat = supportSkills.haTechnique.includes(id);

            const buff = new Buff(syn.source.icon, "", syn.source.skill?.icon);
            addBardBubbles(key, buff, syn);
            let totalBuffed = 0;
            for (const skill of skills) {
                if (hyperAwakeningIds.has(skill.id) && !isHat) {
                    continue;
                }
                if (skill.buffedBy[id]) {
                    totalBuffed += skill.buffedBy[id];
                    synergyDamage += skill.buffedBy[id];
                }
                if (skill.debuffedBy[id]) {
                    totalBuffed += skill.debuffedBy[id];
                    synergyDamage += skill.debuffedBy[id];
                }
            }
            if (isHat) {
                buff.percentage = round((totalBuffed / totalDamage) * 100);
            } else {
                buff.percentage = round((totalBuffed / totalDamageWithoutHa) * 100);
            }
            buffs.buffs.push(buff);
        });

        if (synergyDamage > 0) {
            if (isHat) {
                buffs.percentage = round((synergyDamage / totalDamage) * 100);
            } else {
                buffs.percentage = round((synergyDamage / totalDamageWithoutHa) * 100);
            }
        }
        synergyPercentageDetails.push(buffs);
    });

    return synergyPercentageDetails;
}

export function calculatePartyWidth(
    partyGroupedSynergies: Map<string, Set<string>>,
    remToPx: number,
    currentVw: number
) {
    const partyWidths: { [key: string]: string } = {};
    partyGroupedSynergies.forEach((synergies, partyId) => {
        const widthRem = synergies.size * 3.5 + 10;
        const widthPx = widthRem * remToPx;
        if (widthPx > currentVw - 2 * remToPx) {
            partyWidths[partyId] = `${widthRem}rem`;
        } else {
            partyWidths[partyId] = `calc(100vw - 4.5rem)`;
        }
    });

    return partyWidths;
}

export function addBardBubbles(key: string, buff: { bonus?: number }, syn: StatusEffect) {
    if (key.includes("serenadeofcourage")) {
        if (syn.source.desc.includes("15%")) {
            buff.bonus = 15;
        } else if (syn.source.desc.includes("10%")) {
            buff.bonus = 10;
        } else if (syn.source.desc.includes("5%")) {
            buff.bonus = 5;
        }
    } else if (key.includes("190900")) {
        // twisted fate
        if (syn.source.desc.includes("10")) {
            buff.bonus = 10;
        } else if (syn.source.desc.includes("20")) {
            buff.bonus = 20;
        } else if (syn.source.desc.includes("40")) {
            buff.bonus = 40;
        }
    }
}

const supportClasses = [classNameToClassId["Paladin"], classNameToClassId["Bard"], classNameToClassId["Artist"]];

export function isSupportBuff(statusEffect: StatusEffect) {
    if ([2000260, 2000360].includes(statusEffect.uniqueGroup)) {
        return true;
    }

    if (!statusEffect.source.skill) {
        return false;
    }

    return supportClasses.includes(statusEffect.source.skill.classId);
}

export const supportSkills = {
    marking: [
        21020, // Sound shock, Stigma, Harp of Rythm
        21290, // Sonatina
        31420, // Paint: Drawing Orchids
        36050, // Light Shock
        36080, // Sword of Justice
        36150, // God’s Decree (Godsent Law)
        36100 // Holy Explosion
    ],
    markingGrp: [
        210230, // Pala marking
        210230, // Artist marking
        210230 // Bard marking
    ],
    atkPwr: [
        21170, // Sonic Vibration
        21160, // Heavenly Tune
        31400, // Paint: Sunsketch
        31410, // Paint: Sun Well Skill
        36200, // Heavenly Blessings
        36170 // Wrath of God
    ],
    atkPwrGrp: [
        101105, // Pala atk power
        314004, // Artist atk power
        101204 // Bard atk power
    ],
    identity: [
        21140, // Serenade of Courage 1
        21141, // Serenade of Courage 2
        21142, // Serenade of Courage 3
        21143, // Serenade of Courage
        31050, // Moonfall 10%
        31051 // Moonfall 5%
        // 36800 // Holy Aura
    ],
    identityGrp: [
        368000, // Pala Holy aura group
        310501 // Artist Moonfal group
        // Bard Serenade of Courage - doesn't exist
    ],
    haTechnique: [
        362600, // Paladin
        212305, // Bard
        319503 // Artist
    ],
    evolutionGrp: [
        2000260, // Combat Blessing
        2000360 // Dance of Passion
    ]
};

export function makeSupportBuffKey(statusEffect: StatusEffect) {
    const skillId = statusEffect.source.skill?.id ?? 0;
    let key = "__";
    key += `${classesMap[statusEffect.source.skill?.classId ?? 0]}`;
    if (supportSkills.markingGrp.includes(statusEffect.uniqueGroup)) {
        key += "_1";
    } else if (supportSkills.atkPwrGrp.includes(statusEffect.uniqueGroup)) {
        key += "_0";
    } else if (
        supportSkills.identity.includes(skillId) ||
        supportSkills.identityGrp.includes(statusEffect.uniqueGroup)
    ) {
        key += "_2";
    } else if (supportSkills.haTechnique.includes(statusEffect.uniqueGroup)) {
        key += "_3";
    } else {
        key += "_5";
    }

    if (statusEffect.source.name === "Serenade of Amplification") {
        key += "_";
    }

    if (supportSkills.evolutionGrp.includes(statusEffect.uniqueGroup)) {
        key += "_combat_dance";
    } else {
        key += `_${statusEffect.uniqueGroup ? statusEffect.uniqueGroup : "00_" + statusEffect.source.skill?.name}`;
    }
    return key;
}

const buffCategories = {
    partySynergy: ["classskill", "identity", "ability", "arkpassive"],
    selfItemSynergy: ["pet", "cook", "battleitem", "dropsofether", "bracelet", "elixir"],
    setSynergy: ["set", "arkpassive"],
    selfSkillSynergy: ["classskill", "identity", "ability", "arkpassive"],
    other: ["etc", "arkpassive"]
};

export function isPartySynergy(statusEffect: StatusEffect) {
    return (
        buffCategories.partySynergy.includes(statusEffect.buffCategory) &&
        statusEffect.target === StatusEffectTarget.PARTY
    );
}

function isSelfItemSynergy(statusEffect: StatusEffect) {
    return buffCategories.selfItemSynergy.includes(statusEffect.buffCategory);
}

function isSetSynergy(statusEffect: StatusEffect) {
    return buffCategories.setSynergy.includes(statusEffect.buffCategory);
}

function isSelfSkillSynergy(statusEffect: StatusEffect) {
    return buffCategories.selfSkillSynergy.includes(statusEffect.buffCategory);
}

function isOtherSynergy(statusEffect: StatusEffect) {
    return buffCategories.other.includes(statusEffect.buffCategory);
}

export function getSkillCastBuffs(
    hitDamage: number,
    buffs: number[],
    debuffs: number[],
    encounterDamageStats: EncounterDamageStats,
    supportBuffs: SkillChartSupportDamage,
    playerClassId: number = 0,
    buffType: string = "party",
    buffFilter: boolean = true
) {
    const groupedBuffs: Map<string, Array<StatusEffectWithId>> = new Map();
    const buffed = { buff: false, identity: false, brand: false };

    for (const buffId of buffs) {
        if (encounterDamageStats.buffs.hasOwnProperty(buffId)) {
            includeBuff(
                hitDamage,
                buffId,
                encounterDamageStats.buffs[buffId],
                groupedBuffs,
                supportBuffs,
                playerClassId,
                buffType,
                buffFilter,
                buffed
            );
        }
    }
    for (const buffId of debuffs) {
        if (encounterDamageStats.debuffs.hasOwnProperty(buffId)) {
            includeBuff(
                hitDamage,
                buffId,
                encounterDamageStats.debuffs[buffId],
                groupedBuffs,
                supportBuffs,
                playerClassId,
                buffType,
                buffFilter,
                buffed
            );
        }
    }

    return new Map([...groupedBuffs].sort((a, b) => String(a[0]).localeCompare(b[0])));
}

export function getFormattedBuffString(groupedBuffs: Map<string, Array<StatusEffectWithId>>, iconPath: string) {
    let buffString = "";
    buffString += "<div class='flex'>";
    for (const [, buffs] of groupedBuffs) {
        for (const buff of buffs) {
            buffString += `<img class="size-6 rounded-xs" src="${iconPath + getSkillIcon(buff.statusEffect.source.icon)}" alt="${buff.statusEffect.source.skill?.name}"/>`;
        }
    }
    buffString += "</div>";
    return buffString;
}

function includeBuff(
    hitDamage: number,
    buffId: number,
    buff: StatusEffect,
    map: Map<string, Array<StatusEffectWithId>>,
    supportBuffs: SkillChartSupportDamage,
    playerClassId: number,
    buffType: string,
    buffFilter: boolean,
    buffed: {
        buff: boolean;
        identity: boolean;
        brand: boolean;
    }
) {
    let key = "";
    if (
        buffFilter &&
        ((StatusEffectBuffTypeFlags.DMG |
            StatusEffectBuffTypeFlags.CRIT |
            StatusEffectBuffTypeFlags.ATKSPEED |
            StatusEffectBuffTypeFlags.MOVESPEED |
            StatusEffectBuffTypeFlags.COOLDOWN) &
            buff.buffType) ===
            0
    ) {
        return;
    }
    if (buffType === "party" && isPartySynergy(buff)) {
        if (isSupportBuff(buff)) {
            key = makeSupportBuffKey(buff);
            if (key.includes("_0_") && !buffed.buff) {
                buffed.buff = true;
                supportBuffs.buff += hitDamage;
            } else if (key.includes("_1_") && !buffed.brand) {
                buffed.brand = true;
                supportBuffs.brand += hitDamage;
            } else if (key.includes("_2_") && !buffed.identity) {
                buffed.identity = true;
                supportBuffs.identity += hitDamage;
            }
        } else {
            key = `${classesMap[buff.source.skill?.classId ?? 0]}_${
                buff.uniqueGroup ? buff.uniqueGroup : buff.source.skill?.name
            }`;
        }

        addToMap(key, buffId, buff, map);
    } else if (buffType === "self") {
        if (isPartySynergy(buff)) {
        } else if (isSelfSkillSynergy(buff)) {
            if (buff.buffCategory === "ability") {
                key = `${buff.uniqueGroup ? buff.uniqueGroup : buffId}`;
            } else {
                if (playerClassId !== buff.source.skill?.classId) {
                    return;
                }
                key = `_${classesMap[buff.source.skill?.classId ?? 0]}_${
                    buff.uniqueGroup ? buff.uniqueGroup : buff.source.skill?.name
                }`;
            }
            addToMap(key, buffId, buff, map);
        } else if (isSetSynergy(buff)) {
            addToMap(`_set_${buff.source.setName}`, buffId, buff, map);
        }
    } else if (buffType === "misc") {
        if (isSelfItemSynergy(buff)) {
            if (buff.buffCategory === "bracelet") {
                // put bracelets buffs at the end
                key = `zzbracelet_${buff.uniqueGroup}`;
            } else if (buff.buffCategory === "elixir") {
                key = `elixir_${buff.uniqueGroup}`;
            } else {
                key = buff.buffCategory;
            }
            addToMap(key, buffId, buff, map);
        } else if (isOtherSynergy(buff)) {
            addToMap(`etc_${buff.source.name}`, buffId, buff, map);
        }
    }
}

function addToMap(key: string, buffId: number, buff: StatusEffect, map: Map<string, Array<StatusEffectWithId>>) {
    const buffWithId: StatusEffectWithId = { id: buffId, statusEffect: buff };
    if (map.has(key)) {
        map.get(key)?.push(buffWithId);
    } else {
        map.set(key, [buffWithId]);
    }
}

export const hyperAwakeningIds: Set<number> = new Set([
    16720,
    16730, // berserker
    18240,
    18250, // destroyer
    17250,
    17260, // gunlancer
    36230,
    36240, // paladin
    45820,
    45830, // slayer
    19360,
    19370, // arcanist
    20370,
    20350, // summoner
    21320,
    21330, // bard
    37380,
    37390, // sorceress
    22360,
    22370, // wardancer
    23400,
    23410, // scrapper
    24300,
    24310, // soulfist
    34620,
    34630, // glaivier
    39340,
    39350, // striker
    47300,
    47310, // breaker
    25410,
    25420, // deathblade
    28260,
    28270, // sharpshooter
    27910,
    27920, // shadowhunter
    26940,
    26950, // reaper
    46620,
    46630, // souleater
    29360,
    29370, // deadeye
    30320,
    30330, // artillerist
    35810,
    35890, // machinist
    38320,
    38330, // gunslinger
    31920,
    31930, // artist
    32290,
    32300, // aeromancer
    33520,
    33530 // wildsoul
]);
