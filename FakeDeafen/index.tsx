/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { type PluginAuthor } from "@utils/types";

import { startFakeDeafen, stopFakeDeafen } from "./FakeDeafen";

const authors: PluginAuthor[] = [
    { name: "Maggi", id: 0n }
];

export default definePlugin({
    name: "FakeDeafen",
    description: "Adds a fake deafen toggle inside Discord's deafen context menu.",
    authors,
    patches: [
        {
            find: "vc-fake-deafen-restart-marker",
            replacement: {
                match: /$^/,
                replace: "",
                noWarn: true
            },
            noWarn: true
        }
    ],

    start() {
        startFakeDeafen();
    },

    stop() {
        stopFakeDeafen();
    }
});
