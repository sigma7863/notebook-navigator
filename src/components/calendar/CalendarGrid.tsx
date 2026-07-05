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

import React from 'react';
import type { TFile } from 'obsidian';
import type { CalendarWeekendDays } from '../../settings/types';
import { DateUtils } from '../../utils/dateUtils';
import { CalendarDayButton } from './CalendarDayButton';
import { isWeekendDay } from './calendarUtils';
import type { CalendarDay, CalendarHoverTooltipData, CalendarWeek } from './types';

const DAY_ARIA_LABEL_CACHE_MAX_ENTRIES = 1024;
// Formatted day labels keyed by locale and ISO date; format('LL') output is deterministic per key
const dayAriaLabelCache = new Map<string, string>();

function getDayAriaLabel(day: CalendarDay, displayLocale: string): string {
    const cacheKey = `${displayLocale}|${day.iso}`;
    const cached = dayAriaLabelCache.get(cacheKey);
    if (cached !== undefined) {
        return cached;
    }
    const label = day.date.clone().locale(displayLocale).format('LL');
    if (dayAriaLabelCache.size >= DAY_ARIA_LABEL_CACHE_MAX_ENTRIES) {
        const oldestKey = dayAriaLabelCache.keys().next().value;
        if (oldestKey !== undefined) {
            dayAriaLabelCache.delete(oldestKey);
        }
    }
    dayAriaLabelCache.set(cacheKey, label);
    return label;
}

interface CalendarDayCellProps {
    day: CalendarDay;
    dayCellClassName: string;
    dayButtonClassName: string;
    featureImageUrl: string | null;
    hasFeatureImageKey: boolean;
    hasUnfinishedTasks: boolean;
    frontmatterTitle: string;
    displayLocale: string;
    dateFormat: string;
    isMobile: boolean;
    canCreateDayNotes: boolean;
    onShowTooltip: (element: HTMLElement, tooltipData: CalendarHoverTooltipData) => void;
    onHideTooltip: (element: HTMLElement) => void;
    onDayClick: (event: React.MouseEvent<HTMLButtonElement>, day: CalendarDay) => void;
    onDayMouseDown: (event: React.MouseEvent<HTMLButtonElement>, day: CalendarDay) => void;
    onDayContextMenu: (event: React.MouseEvent<HTMLButtonElement>, day: CalendarDay, canCreate: boolean, hasFeatureImage: boolean) => void;
}

/**
 * One day cell. Memoized so grid commits that do not change a cell's inputs
 * (active-editor changes, task or image updates on other days) skip the cell.
 */
const CalendarDayCell = React.memo(function CalendarDayCell({
    day,
    dayCellClassName,
    dayButtonClassName,
    featureImageUrl,
    hasFeatureImageKey,
    hasUnfinishedTasks,
    frontmatterTitle,
    displayLocale,
    dateFormat,
    isMobile,
    canCreateDayNotes,
    onShowTooltip,
    onHideTooltip,
    onDayClick,
    onDayMouseDown,
    onDayContextMenu
}: CalendarDayCellProps) {
    const dayNumber = day.date.date();
    const style: React.CSSProperties | undefined = featureImageUrl ? { backgroundImage: `url(${featureImageUrl})` } : undefined;
    const ariaLabel = getDayAriaLabel(day, displayLocale);
    const dateTimestamp = day.date.toDate().getTime();
    const hasFrontmatterTitle = frontmatterTitle.trim().length > 0;
    const tooltipTitle = hasFrontmatterTitle ? frontmatterTitle : DateUtils.formatDate(dateTimestamp, dateFormat);
    const showDate = hasFrontmatterTitle;
    const tooltipAriaText = hasFrontmatterTitle ? `${ariaLabel}, ${frontmatterTitle}` : ariaLabel;
    const tooltipEnabled = Boolean(day.file || featureImageUrl);
    const tooltipData: CalendarHoverTooltipData = {
        imageUrl: featureImageUrl,
        title: tooltipTitle || ariaLabel,
        dateTimestamp,
        previewPath: day.file?.path ?? null,
        previewEnabled: Boolean(day.file && day.file.extension === 'md'),
        showDate
    };

    return (
        <div className={dayCellClassName}>
            <CalendarDayButton
                className={dayButtonClassName}
                ariaText={tooltipAriaText}
                style={style}
                tooltipEnabled={tooltipEnabled}
                tooltipData={tooltipData}
                dayNumber={dayNumber}
                isMobile={isMobile}
                showUnfinishedTaskIndicator={hasUnfinishedTasks}
                onShowTooltip={onShowTooltip}
                onHideTooltip={onHideTooltip}
                onMouseDown={event => onDayMouseDown(event, day)}
                onClick={event => onDayClick(event, day)}
                onContextMenu={event => onDayContextMenu(event, day, canCreateDayNotes, hasFeatureImageKey)}
            />
        </div>
    );
});

interface CalendarGridProps {
    activeEditorFilePath: string | null;
    showWeekNumbers: boolean;
    weekdays: string[];
    weekStartsOn: number;
    trailingSpacerWeekCount: number;
    weeks: CalendarWeek[];
    weekNotesEnabled: boolean;
    weekNoteFilesByKey: Map<string, TFile | null>;
    weekUnfinishedTaskCountByKey: Map<string, number>;
    displayLocale: string;
    calendarWeekendDays: CalendarWeekendDays;
    todayIso: string | null;
    unfinishedTaskCountByIso: Map<string, number>;
    featureImageUrls: Record<string, string>;
    featureImageKeysByIso: Map<string, string>;
    frontmatterTitlesByPath: Map<string, string>;
    dateFormat: string;
    isMobile: boolean;
    canCreateDayNotes: boolean;
    onShowTooltip: (element: HTMLElement, tooltipData: CalendarHoverTooltipData) => void;
    onHideTooltip: (element: HTMLElement) => void;
    onDayClick: (event: React.MouseEvent<HTMLButtonElement>, day: CalendarDay) => void;
    onDayMouseDown: (event: React.MouseEvent<HTMLButtonElement>, day: CalendarDay) => void;
    onDayContextMenu: (event: React.MouseEvent<HTMLButtonElement>, day: CalendarDay, canCreate: boolean, hasFeatureImage: boolean) => void;
    onWeekClick: (event: React.MouseEvent<HTMLElement>, week: CalendarWeek, weekNoteFile: TFile | null) => void;
    onWeekMouseDown: (event: React.MouseEvent<HTMLElement>, week: CalendarWeek, weekNoteFile: TFile | null) => void;
    onWeekLabelClick: (event: React.MouseEvent<HTMLElement>, week: CalendarWeek) => void;
    onWeekContextMenu: (event: React.MouseEvent<HTMLElement>, week: CalendarWeek, weekNoteFile: TFile | null) => void;
}

export const CalendarGrid = React.memo(function CalendarGrid({
    activeEditorFilePath,
    showWeekNumbers,
    weekdays,
    weekStartsOn,
    trailingSpacerWeekCount,
    weeks,
    weekNotesEnabled,
    weekNoteFilesByKey,
    weekUnfinishedTaskCountByKey,
    displayLocale,
    calendarWeekendDays,
    todayIso,
    unfinishedTaskCountByIso,
    featureImageUrls,
    featureImageKeysByIso,
    frontmatterTitlesByPath,
    dateFormat,
    isMobile,
    canCreateDayNotes,
    onShowTooltip,
    onHideTooltip,
    onDayClick,
    onDayMouseDown,
    onDayContextMenu,
    onWeekClick,
    onWeekMouseDown,
    onWeekLabelClick,
    onWeekContextMenu
}: CalendarGridProps) {
    // Consecutive week rows share the weekday for each column, so weekend flags are computed once per column
    const firstWeekDays = weeks[0]?.days;
    const weekendByIndex = firstWeekDays
        ? firstWeekDays.map(weekDay => isWeekendDay(weekDay.date.toDate().getDay(), calendarWeekendDays))
        : [];

    return (
        <div className="nn-navigation-calendar-grid" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
            <div className="nn-navigation-calendar-weekdays" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                {showWeekNumbers ? <div className="nn-navigation-calendar-weeknumber-spacer" /> : null}
                {showWeekNumbers ? <div className="nn-navigation-calendar-weeknumber-divider" aria-hidden="true" /> : null}
                {weekdays.map((day, index) => (
                    <div key={(weekStartsOn + index) % 7} className="nn-navigation-calendar-weekday">
                        {day}
                    </div>
                ))}
            </div>

            <div className="nn-navigation-calendar-weeks" data-weeknumbers={showWeekNumbers ? 'true' : undefined}>
                {weeks.map((week, weekIndex) => {
                    const weekNoteFile = weekNoteFilesByKey.get(week.key) ?? null;
                    const weekHasUnfinishedTasks = (weekUnfinishedTaskCountByKey.get(week.key) ?? 0) > 0;
                    const isActiveEditorWeek = Boolean(weekNoteFile && activeEditorFilePath === weekNoteFile.path);
                    const hasWeekAbove = weekIndex > 0;
                    const hasWeekBelow = weekIndex < weeks.length - 1;

                    return (
                        <div
                            key={week.key}
                            className={`nn-navigation-calendar-week${weekIndex < weeks.length - 1 ? ' has-next-week' : ''}`}
                        >
                            {showWeekNumbers ? (
                                <>
                                    {weekNotesEnabled ? (
                                        <button
                                            type="button"
                                            className={[
                                                'nn-navigation-calendar-weeknumber',
                                                'nn-navigation-calendar-weeknumber-button',
                                                weekNoteFile ? 'has-period-note' : '',
                                                isActiveEditorWeek ? 'is-active-editor-file' : '',
                                                weekHasUnfinishedTasks ? 'has-unfinished-tasks' : ''
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                            onMouseDown={event => onWeekMouseDown(event, week, weekNoteFile)}
                                            onClick={event => onWeekClick(event, week, weekNoteFile)}
                                            onContextMenu={event => onWeekContextMenu(event, week, weekNoteFile)}
                                        >
                                            <span className="nn-navigation-calendar-active-outline" aria-hidden="true" />
                                            <span className="nn-navigation-calendar-weeknumber-value">{week.weekNumber}</span>
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="nn-navigation-calendar-weeknumber nn-navigation-calendar-weeknumber-button"
                                            onClick={event => onWeekLabelClick(event, week)}
                                            onContextMenu={event => onWeekContextMenu(event, week, null)}
                                        >
                                            <span className="nn-navigation-calendar-active-outline" aria-hidden="true" />
                                            <span className="nn-navigation-calendar-weeknumber-value">{week.weekNumber}</span>
                                        </button>
                                    )}
                                    <div className="nn-navigation-calendar-weeknumber-divider" aria-hidden="true" />
                                </>
                            ) : null}
                            {week.days.map((day, dayIndex) => {
                                const hasDailyNote = Boolean(day.file);
                                const dayUnfinishedTaskCount = hasDailyNote ? (unfinishedTaskCountByIso.get(day.iso) ?? 0) : 0;
                                const hasUnfinishedTasks = dayUnfinishedTaskCount > 0;
                                const featureImageUrl = featureImageUrls[day.iso] ?? null;
                                const hasFeatureImageKey = featureImageKeysByIso.has(day.iso);
                                const isToday = todayIso === day.iso;
                                const isActiveEditorDay = Boolean(day.file && activeEditorFilePath === day.file.path);
                                const isWeekend = weekendByIndex[dayIndex] ?? false;
                                const hasWeekendBefore = isWeekend && dayIndex > 0 && Boolean(weekendByIndex[dayIndex - 1]);
                                const hasWeekendAfter =
                                    isWeekend && dayIndex < week.days.length - 1 && Boolean(weekendByIndex[dayIndex + 1]);
                                const hasWeekendAbove = isWeekend && hasWeekAbove;
                                const hasWeekendBelow = isWeekend && hasWeekBelow;
                                const roundWeekendTopLeft = isWeekend && !hasWeekendAbove && !hasWeekendBefore;
                                const roundWeekendTopRight = isWeekend && !hasWeekendAbove && !hasWeekendAfter;
                                const roundWeekendBottomLeft = isWeekend && !hasWeekendBelow && !hasWeekendBefore;
                                const roundWeekendBottomRight = isWeekend && !hasWeekendBelow && !hasWeekendAfter;
                                const dayCellClassName = [
                                    'nn-navigation-calendar-day-cell',
                                    isWeekend ? 'is-weekend' : 'is-weekday',
                                    hasWeekendBefore ? 'has-weekend-before' : '',
                                    hasWeekendAfter ? 'has-weekend-after' : '',
                                    hasWeekendAbove ? 'has-weekend-above' : '',
                                    hasWeekendBelow ? 'has-weekend-below' : '',
                                    roundWeekendTopLeft ? 'round-weekend-top-left' : '',
                                    roundWeekendTopRight ? 'round-weekend-top-right' : '',
                                    roundWeekendBottomLeft ? 'round-weekend-bottom-left' : '',
                                    roundWeekendBottomRight ? 'round-weekend-bottom-right' : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ');

                                const dayButtonClassName = [
                                    'nn-navigation-calendar-day',
                                    day.inMonth ? 'is-in-month' : 'is-outside-month',
                                    isToday ? 'is-today' : '',
                                    isActiveEditorDay ? 'is-active-editor-file' : '',
                                    isWeekend ? 'is-weekend' : 'is-weekday',
                                    hasDailyNote ? 'has-daily-note' : '',
                                    hasUnfinishedTasks ? 'has-unfinished-tasks' : '',
                                    hasFeatureImageKey ? 'has-feature-image-key' : '',
                                    featureImageUrl ? 'has-feature-image' : ''
                                ]
                                    .filter(Boolean)
                                    .join(' ');

                                const frontmatterTitle = day.file ? (frontmatterTitlesByPath.get(day.file.path) ?? '') : '';

                                return (
                                    <CalendarDayCell
                                        key={day.iso}
                                        day={day}
                                        dayCellClassName={dayCellClassName}
                                        dayButtonClassName={dayButtonClassName}
                                        featureImageUrl={featureImageUrl}
                                        hasFeatureImageKey={hasFeatureImageKey}
                                        hasUnfinishedTasks={hasUnfinishedTasks}
                                        frontmatterTitle={frontmatterTitle}
                                        displayLocale={displayLocale}
                                        dateFormat={dateFormat}
                                        isMobile={isMobile}
                                        canCreateDayNotes={canCreateDayNotes}
                                        onShowTooltip={onShowTooltip}
                                        onHideTooltip={onHideTooltip}
                                        onDayClick={onDayClick}
                                        onDayMouseDown={onDayMouseDown}
                                        onDayContextMenu={onDayContextMenu}
                                    />
                                );
                            })}
                        </div>
                    );
                })}
                {Array.from({ length: trailingSpacerWeekCount }).map((_entry, spacerIndex) => (
                    <div key={`spacer-week-${spacerIndex}`} className="nn-navigation-calendar-week nn-navigation-calendar-week-spacer">
                        {showWeekNumbers ? (
                            <div
                                className="nn-navigation-calendar-weeknumber nn-navigation-calendar-weeknumber-spacer-row"
                                aria-hidden="true"
                            />
                        ) : null}
                        {Array.from({ length: 7 }).map((_day, dayIndex) => (
                            <div
                                key={`spacer-day-${spacerIndex}-${dayIndex}`}
                                className="nn-navigation-calendar-day-spacer"
                                aria-hidden="true"
                            />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
});
