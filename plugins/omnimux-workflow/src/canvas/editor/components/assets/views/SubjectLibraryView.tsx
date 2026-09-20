import React, { useState } from 'react';
import {
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Plus,
  Sparkles,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { SortFilterPopover } from '../popovers/SortFilterPopover';
import { SUBJECT_CATEGORY_TABS } from '../../../../bridge/assetsLibraryMapper';
import type { SubjectPack } from '../types';
import { useT } from '../../../../i18n';

interface SubjectLibraryViewProps {
  subjects: SubjectPack[];
  error?: string | null;
  onBack: () => void;
  onSelectSubject: (subject: SubjectPack) => void;
  onCreateSubject: () => void;
}

export const SubjectLibraryView: React.FC<SubjectLibraryViewProps> = ({
  subjects,
  error,
  onBack,
  onSelectSubject,
  onCreateSubject,
}) => {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortValue, setSortValue] = useState<'recent' | 'name' | 'count'>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<DOMRect | null>(null);

  const getCatLabel = (id: string, defaultLabel: string) => {
    switch (id) {
      case 'all': return t('assets.popover.all') || defaultLabel;
      case 'character': return t('assets.tag.character') || defaultLabel;
      case 'scene': return t('assets.tag.scene') || defaultLabel;
      case 'prop': return t('assets.tag.prop') || defaultLabel;
      default: return defaultLabel;
    }
  };

  const handleOpenSort = (e: React.MouseEvent<HTMLButtonElement>) => {
    setSortAnchor(e.currentTarget.getBoundingClientRect());
    setSortOpen((prev) => !prev);
  };

  const filteredSubjects = subjects
    .filter((s) => {
      if (selectedCategory !== 'all') {
        if (s.type) {
          if (s.type !== selectedCategory) return false;
        } else {
          const cat = SUBJECT_CATEGORY_TABS.find((c) => c.id === selectedCategory);
          if (cat && cat.id !== 'all') {
            const matchTag = s.tags.some((t) => t === cat.label);
            if (!matchTag) return false;
          }
        }
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortValue === 'recent') return b.updatedAt - a.updatedAt;
      if (sortValue === 'name') return a.name.localeCompare(b.name);
      if (sortValue === 'count') return b.itemCount - a.itemCount;
      return 0;
    });

  const getSortLabel = () => {
    switch (sortValue) {
      case 'recent':
        return t('assets.popover.sortRecent') || '最近更新';
      case 'name':
        return t('assets.popover.sortNameAZ') || '名称 A-Z';
      case 'count':
        return t('assets.popover.sortCount') || '素材数量';
      default:
        return t('assets.filter.sort') || '排序';
    }
  };

  return (
    <div className="wf-subject-view-compact">
      {/* 1. 紧凑面包屑导航顶栏 */}
      <div className="wf-subject-nav-header-compact">
        <button type="button" className="wf-subject-nav-back-btn-compact" onClick={onBack}>
          <ArrowLeft size={13} />
          <span>{t('assets.subjectLibrary') || '主体库'}</span>
        </button>

        <button
          type="button"
          className="wf-subject-sort-dropdown-btn-compact"
          onClick={handleOpenSort}
        >
          <SlidersHorizontal size={11} />
          <span>{getSortLabel()}</span>
          <ChevronDown size={11} />
        </button>
      </div>

      {/* 2. 紧凑搜索框与分类 Pills */}
      <div className="wf-subject-toolbar-compact">
        <div className="wf-subject-search-input-wrapper-compact">
          <Search size={13} className="wf-search-icon" />
          <input
            type="text"
            className="wf-subject-search-input-compact"
            placeholder={t('assets.searchSubject') || '搜索主体名称或标签...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* 快捷分类 Pills */}
        <div className="wf-subject-pills-row-compact">
          {SUBJECT_CATEGORY_TABS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`wf-subject-pill-compact ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {getCatLabel(cat.id, cat.label)}
            </button>
          ))}
        </div>
      </div>

      {/* 3. 紧凑主体卡片网格列表 (自适应紧凑卡片，无大片空黑) */}
      <div className="wf-drawer-content-scroll-compact">
        {filteredSubjects.length === 0 ? (
          <div className="wf-assets-empty-state-compact">
            <Sparkles size={24} className="wf-assets-empty-icon" />
            <div className="wf-assets-empty-title">
              {error ? '主体库暂不可用' : subjects.length === 0 ? '暂无主体' : '未找到匹配的主体'}
            </div>
          </div>
        ) : (
          <div className="wf-subject-grid-compact">
            {filteredSubjects.map((sub) => (
              <div
                key={sub.id}
                className="wf-subject-card-compact"
                draggable
                title={sub.files?.some((file) => file.real_path) ? sub.name : '无本地文件，无法入创作画布'}
                onDragStart={(e) => {
                  const firstFile = (sub.files || []).find((file) => file.real_path);
                  e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify({
                      type: 'omnimux-asset',
                      asset: {
                        id: sub.id,
                        name: firstFile?.original_name || sub.name,
                        real_path: firstFile?.real_path,
                        files: sub.files,
                      },
                    }),
                  );
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onSelectSubject(sub)}
              >
                <div className="wf-subject-card-cover-compact">
                  {sub.avatar ? (
                    <img src={sub.avatar} alt={sub.name} className="wf-subject-card-img-compact" />
                  ) : (
                    <div className="wf-subject-card-placeholder-compact">
                      <Sparkles size={20} />
                    </div>
                  )}
                  <span className="wf-subject-card-count-badge-compact">
                    <Layers size={10} /> {sub.itemCount} 项
                  </span>
                </div>

                <div className="wf-subject-card-info-compact">
                  <div className="wf-subject-card-name-compact" title={sub.name}>
                    {sub.name}
                  </div>
                  <div className="wf-subject-card-tags-compact">
                    {sub.tags.slice(0, 3).map((t, idx) => (
                      <span key={idx} className="wf-subject-card-tag-compact">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 始终固定在底部的新建主体按钮 */}
      <div className="wf-assets-bottom-bar-compact">
        <button
          type="button"
          className="wf-assets-action-primary-btn-compact"
          style={{ width: '100%' }}
          onClick={onCreateSubject}
        >
          <Plus size={13} />
          <span>{t('assets.newSubject') || '新建主体'}</span>
        </button>
      </div>

      {/* 排序 Popover */}
      <SortFilterPopover
        isOpen={sortOpen}
        anchorRect={sortAnchor}
        sortValue={sortValue}
        onChange={(val) => setSortValue(val)}
        onClose={() => setSortOpen(false)}
      />
    </div>
  );
};
