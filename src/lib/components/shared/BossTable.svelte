<script lang="ts">
    import { settings } from "$lib/utils/settings";
    import { tooltip } from "$lib/utils/tooltip";
    import { flip } from "svelte/animate";
    import BossRow from "./BossRow.svelte";
    import type { EncounterState } from "$lib/encounter.svelte";

    interface Props {
        enc: EncounterState;
        inspectBoss: (boss: string) => void;
    }

    let { enc, inspectBoss }: Props = $props();

    let mostDamageDealtBoss = $derived(enc.bosses[0]?.damageStats.damageDealt ?? 1);
    let bossDamageDealtPercentages: Array<number> = $derived(
        enc.bosses.map((boss) => (boss.damageStats.damageDealt / mostDamageDealtBoss) * 100)
    );
</script>

<table class="relative w-full table-fixed">
    <thead class="sticky top-0 z-40 h-6">
        <tr class="bg-zinc-900 tracking-tight">
            <th class="w-14 px-2 text-left font-normal"></th>
            <th class="w-full"></th>
            <th class="w-14 font-normal" use:tooltip={{ content: "Damage Dealt" }}>DMG</th>
            <th class="w-14 font-normal" use:tooltip={{ content: "Damage per second" }}>DPS</th>
        </tr>
    </thead>
    <tbody class="relative z-10">
        {#each enc.bosses as boss, i (boss.name)}
            <tr
                class="h-7 px-2 py-1 {$settings.general.underlineHovered ? 'hover:underline' : ''}"
                animate:flip={{ duration: 200 }}
                onclick={() => inspectBoss(boss.name)}>
                <BossRow {boss} {enc} width={bossDamageDealtPercentages[i]} index={i} />
            </tr>
        {/each}
    </tbody>
</table>
