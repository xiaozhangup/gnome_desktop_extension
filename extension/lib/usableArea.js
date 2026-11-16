// SPDX-License-Identifier: GPL-2.0-or-later
// SPDX-FileCopyrightText: 2026 Eugenio Schintu

// Tracks usable desktop area per monitor, combining GNOME Shell's work area
// with dock/panel margins reported by extensions (e.g. Dash to Dock) via
// the DesktopIconsUsableArea interface.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

const USABLE_AREA_UUID = '130cbc66-235c-4bd6-8571-98d2d8bba5e2';
const REFRESH_DELAY_MS = 250;

export class UsableArea extends EventEmitter {
    constructor() {
        super();
        this._usableAreas = {};
        this._marginsList = {};
        this._refreshTimerId = 0;
    }

    get uuid() {
        return USABLE_AREA_UUID;
    }

    destroy() {
        if (this._refreshTimerId) {
            GLib.source_remove(this._refreshTimerId);
            this._refreshTimerId = 0;
        }
    }

    setMarginsForExtension(extensionUUID, margins) {
        if (margins === null) {
            if (!(extensionUUID in this._marginsList))
                return;
            delete this._marginsList[extensionUUID];
        } else {
            this._marginsList[extensionUUID] = margins;
        }
        if (this._refreshTimerId)
            GLib.source_remove(this._refreshTimerId);
        this._refreshTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REFRESH_DELAY_MS, () => {
            this._refreshTimerId = 0;
            this._refreshMargins();
            return GLib.SOURCE_REMOVE;
        });
    }

    _refreshMargins() {
        this._usableAreas = {};
        for (const margins of Object.values(this._marginsList)) {
            for (const [workspace, rect] of Object.entries(margins)) {
                const wsIndex = parseInt(workspace, 10);
                const index = wsIndex < 0 ? Main.layoutManager.primaryIndex : wsIndex;
                if (!(index in this._usableAreas))
                    this._usableAreas[index] = {top: 0, bottom: 0, left: 0, right: 0};
                for (const side of ['top', 'bottom', 'left', 'right'])
                    this._usableAreas[index][side] = Math.max(this._usableAreas[index][side], rect[side] ?? 0);
            }
        }
        this.emit('updated-usable-area');
    }

    getMonitorGeometry(monitorIndex) {
        const lm = Main.layoutManager;
        const m = lm.monitors[monitorIndex];
        const wa = lm.getWorkAreaForMonitor(monitorIndex);

        let top = Math.max(0, wa.y - m.y);
        let left = Math.max(0, wa.x - m.x);
        let right = Math.max(0, m.width - wa.width - left);
        let bottom = Math.max(0, m.height - wa.height - top);

        const extra = this._usableAreas[monitorIndex];
        if (extra) {
            top = Math.max(top, extra.top);
            bottom = Math.max(bottom, extra.bottom);
            left = Math.max(left, extra.left);
            right = Math.max(right, extra.right);
        }

        return {
            x: m.x,
            y: m.y,
            width: m.width,
            height: m.height,
            insets: {top, bottom, left, right},
        };
    }
}
