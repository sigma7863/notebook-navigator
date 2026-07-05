/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { FILE_VISIBILITY } from '../../src/utils/fileTypeUtils';
import { calculateFolderNoteCounts } from '../../src/utils/noteCountUtils';
import { createTestTFile } from './createTestTFile';

function createFolder(path: string, children: Array<TFile | TFolder>): TFolder {
    const folder = new TFolder() as TFolder & { children: Array<TFile | TFolder> };
    folder.path = path;
    folder.name = path.split('/').pop() ?? path;
    folder.children = children;
    children.forEach(child => {
        Reflect.set(child, 'parent', folder);
    });
    return folder;
}

describe('calculateFolderNoteCounts', () => {
    it('excludes configured folders only from ancestor descendant counts', () => {
        const rootNote = createTestTFile('Root.md');
        const dailyNote = createTestTFile('Daily/today.md');
        const dailyYearNote = createTestTFile('Daily/2026/day.md');
        const workNote = createTestTFile('Work/work.md');
        const resourceNote = createTestTFile('Work/resources/asset.md');

        const dailyYearFolder = createFolder('Daily/2026', [dailyYearNote]);
        const dailyFolder = createFolder('Daily', [dailyNote, dailyYearFolder]);
        const resourcesFolder = createFolder('Work/resources', [resourceNote]);
        const workFolder = createFolder('Work', [workNote, resourcesFolder]);
        const rootFolder = createFolder('', [rootNote, dailyFolder, workFolder]);

        const app = new App();
        app.metadataCache.getFileCache = () => null;
        const options = {
            app,
            fileVisibility: FILE_VISIBILITY.ALL,
            excludedFiles: [],
            excludedFolders: [],
            descendantExcludedFolders: ['/Daily', 'resources'],
            fileNameMatcher: null,
            hiddenFileTagVisibility: null,
            includeDescendants: true,
            showHiddenFolders: false,
            hideFolderNoteInList: false,
            folderNoteSettings: {
                enableFolderNotes: false,
                folderNoteName: '',
                folderNoteNamePattern: ''
            }
        };

        expect(calculateFolderNoteCounts(rootFolder, options)).toEqual({ current: 1, descendants: 1, total: 2 });
        expect(calculateFolderNoteCounts(dailyFolder, options)).toEqual({ current: 1, descendants: 1, total: 2 });
    });
});
