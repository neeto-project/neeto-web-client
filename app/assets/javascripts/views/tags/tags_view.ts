import { WebDirective, PanelPuppet } from '@/types';
import { WebApplication } from '@/ui_models/application';
import {
  SNTag,
  ContentType,
  ApplicationEvent,
  ComponentAction,
  SNSmartTag,
  ComponentArea,
  SNComponent,
  WebPrefKey,
  UuidString,
  TagMutator
} from 'snjs';
import template from './tags-view.pug';
import { AppStateEvent } from '@/ui_models/app_state';
import { PANEL_NAME_TAGS } from '@/views/constants';
import { STRING_DELETE_TAG } from '@/strings';
import { PureViewCtrl } from '@Views/abstract/pure_view_ctrl';
import { confirmDialog } from '@/services/alertService';

type NoteCounts = Partial<Record<string, number>>

type TagState = {
  tags: SNTag[]
  smartTags: SNSmartTag[]
  noteCounts: NoteCounts
  selectedTag?: SNTag
  /** If creating a new tag, the previously selected tag will be set here, so that if new
   * tag creation is canceled, the previous tag is re-selected */
  previousTag?: SNTag
  /** If a tag is in edit state, it will be set as the editingTag */
  editingTag?: SNTag
  /** If a tag is new and not yet saved, it will be set as the template tag */
  templateTag?: SNTag
}

class TagsViewCtrl extends PureViewCtrl<{}, TagState> {

  /** Passed through template */
  readonly application!: WebApplication
  private readonly panelPuppet: PanelPuppet
  private unregisterComponent?: any
  component?: SNComponent
  /** The original name of the edtingTag before it began editing */
  private editingOriginalName?: string
  formData: { tagTitle?: string } = {}
  titles: Partial<Record<UuidString, string>> = {}
  private removeTagsObserver?: () => void

  /* @ngInject */
  constructor(
    $timeout: ng.ITimeoutService,
  ) {
    super($timeout);
    this.panelPuppet = {
      onReady: () => this.loadPreferences()
    };
  }

  deinit() {
    this.removeTagsObserver?.();
    this.removeTagsObserver = undefined;
    this.unregisterComponent();
    this.unregisterComponent = undefined;
    super.deinit();
  }

  getInitialState() {
    return {
      tags: [],
      smartTags: [],
      noteCounts: {},
    };
  }

  getState() {
    return this.state as TagState;
  }

  async onAppStart() {
    super.onAppStart();
    this.registerComponentHandler();
  }

  async onAppLaunch() {
    super.onAppLaunch();
    this.loadPreferences();
    this.beginStreamingItems();
    const smartTags = this.application.getSmartTags();
    this.setState({
      smartTags: smartTags,
    });
    this.selectTag(smartTags[0]);
  }

  /** @override */
  onAppIncrementalSync() {
    super.onAppIncrementalSync();
    this.reloadNoteCounts();
  }

  /**
   * Returns all officially saved tags as reported by the model manager.
   * @access private
   */
  getMappedTags() {
    const tags = this.application.getItems(ContentType.Tag) as SNTag[];
    return tags.sort((a, b) => {
      return a.title < b.title ? -1 : 1;
    });
  }

  beginStreamingItems() {
    this.removeTagsObserver = this.application.streamItems(
      [ContentType.Tag, ContentType.SmartTag],
      async (items) => {
        await this.setState({
          tags: this.getMappedTags(),
          smartTags: this.application.getSmartTags(),
        });

        for (const tag of items as Array<SNTag | SNSmartTag>) {
          this.titles[tag.uuid] = tag.title;
        }

        this.reloadNoteCounts();
        const selectedTag = this.state.selectedTag;
        if (selectedTag) {
          /** If the selected tag has been deleted, revert to All view. */
          const matchingTag = items.find((tag) => {
            return tag.uuid === selectedTag.uuid;
          }) as SNTag;
          if (matchingTag) {
            if (matchingTag.deleted) {
              this.selectTag(this.getState().smartTags[0]);
            } else {
              this.setState({
                selectedTag: matchingTag
              })
            }
          }
        }
      }
    );
  }

  /** @override */
  onAppStateEvent(eventName: AppStateEvent, data?: any) {
    if (eventName === AppStateEvent.PreferencesChanged) {
      this.loadPreferences();
    } else if (eventName === AppStateEvent.TagChanged) {
      this.setState({
        selectedTag: this.application.getAppState().getSelectedTag()
      });
    }
  }


  /** @override */
  async onAppEvent(eventName: ApplicationEvent) {
    super.onAppEvent(eventName);
    if (eventName === ApplicationEvent.LocalDataIncrementalLoad) {
      this.reloadNoteCounts();
    }
  }

  reloadNoteCounts() {
    let allTags: Array<SNTag | SNSmartTag> = [];
    if (this.getState().tags) {
      allTags = allTags.concat(this.getState().tags);
    }
    if (this.getState().smartTags) {
      allTags = allTags.concat(this.getState().smartTags);
    }
    const noteCounts: NoteCounts = {};
    for (const tag of allTags) {
      if (tag.isSmartTag()) {
        /** Other smart tags do not contain counts */
        if (tag.isAllTag) {
          const notes = this.application.notesMatchingSmartTag(tag as SNSmartTag)
            .filter((note) => {
              return !note.archived && !note.trashed;
            })
          noteCounts[tag.uuid] = notes.length;
        }
      } else {
        const notes = this.application.referencesForItem(tag, ContentType.Note)
          .filter((note) => {
            return !note.archived && !note.trashed;
          })
        noteCounts[tag.uuid] = notes.length;
      }
    }
    this.setState({
      noteCounts: noteCounts
    });
  }

  loadPreferences() {
    if (!this.panelPuppet.ready) {
      return;
    }
    const width = this.application.getPrefsService().getValue(WebPrefKey.TagsPanelWidth);
    if (width) {
      this.panelPuppet.setWidth!(width);
      if (this.panelPuppet.isCollapsed!()) {
        this.application.getAppState().panelDidResize(
          PANEL_NAME_TAGS,
          this.panelPuppet.isCollapsed!()
        );
      }
    }
  }

  onPanelResize = (
    newWidth: number,
    lastLeft: number,
    isAtMaxWidth: boolean,
    isCollapsed: boolean
  ) => {
    this.application.getPrefsService().setUserPrefValue(
      WebPrefKey.TagsPanelWidth,
      newWidth,
      true
    );
    this.application.getAppState().panelDidResize(
      PANEL_NAME_TAGS,
      isCollapsed
    );
  }

  registerComponentHandler() {
    this.unregisterComponent = this.application.componentManager!.registerHandler({
      identifier: 'tags',
      areas: [ComponentArea.TagsList],
      activationHandler: (_, component) => {
        this.component = component;
      },
      contextRequestHandler: () => {
        return undefined;
      },
      actionHandler: (_, action, data) => {
        if (action === ComponentAction.SelectItem) {
          if (data.item.content_type === ContentType.Tag) {
            const tag = this.application.findItem(data.item.uuid);
            if (tag) {
              this.selectTag(tag as SNTag);
            }
          } else if (data.item.content_type === ContentType.SmartTag) {
            this.application.createTemplateItem(
              ContentType.SmartTag,
              data.item.content
            ).then(smartTag => {
              this.selectTag(smartTag as SNSmartTag);
            });
          }
        } else if (action === ComponentAction.ClearSelection) {
          this.selectTag(this.getState().smartTags[0]);
        }
      }
    });
  }

  async selectTag(tag: SNTag) {
    if (tag.conflictOf) {
      this.application.changeAndSaveItem(tag.uuid, (mutator) => {
        mutator.conflictOf = undefined;
      })
    }
    this.application.getAppState().setSelectedTag(tag);
  }

  async clickedAddNewTag() {
    if (this.getState().editingTag) {
      return;
    }
    const newTag = await this.application.createTemplateItem(
      ContentType.Tag
    ) as SNTag;
    this.setState({
      tags: [newTag].concat(this.getState().tags),
      previousTag: this.getState().selectedTag,
      selectedTag: newTag,
      editingTag: newTag,
      templateTag: newTag
    });
  }

  onTagTitleChange(tag: SNTag | SNSmartTag) {
    this.setState({
      editingTag: tag
    });
  }

  async saveTag($event: Event, tag: SNTag) {
    ($event.target! as HTMLInputElement).blur();
    if (this.getState().templateTag) {
      return this.saveNewTag();
    } else {
      return this.saveTagRename(tag);
    }
  }

  async saveTagRename(tag: SNTag) {
    const newTitle = this.titles[tag.uuid] || '';
    if (newTitle.length === 0) {
      this.titles[tag.uuid] = this.editingOriginalName;
      this.editingOriginalName = undefined;
      return;
    }
    const existingTag = this.application.findTagByTitle(newTitle);
    if (existingTag && existingTag.uuid !== tag.uuid) {
      this.application.alertService!.alert(
        "A tag with this name already exists."
      );
      return;
    };
    await this.application.changeAndSaveItem<TagMutator>(tag.uuid, (mutator) => {
      mutator.title = newTitle;
    });
    await this.setState({
      editingTag: undefined
    });
  }

  async saveNewTag() {
    const newTag = this.getState().templateTag!;
    const newTitle = this.titles[newTag.uuid] || '';
    if (newTitle.length === 0) {
      await this.setState({
        templateTag: undefined
      });
      return;
    }
    const existingTag = this.application.findTagByTitle(newTitle);
    if (existingTag) {
      this.application.alertService!.alert(
        "A tag with this name already exists."
      );
      return;
    };
    const insertedTag = await this.application.insertItem(newTag);
    const changedTag = await this.application.changeItem<TagMutator>(insertedTag.uuid, (m) => {
      m.title = newTitle;
    });
    await this.setState({
      templateTag: undefined,
      editingTag: undefined
    });
    this.selectTag(changedTag as SNTag);
    await this.application.saveItem(changedTag!.uuid);
  }

  async selectedRenameTag(tag: SNTag) {
    this.editingOriginalName = tag.title;
    await this.setState({
      editingTag: tag
    });
    document.getElementById('tag-' + tag.uuid)!.focus();
  }

  selectedDeleteTag(tag: SNTag) {
    this.removeTag(tag);
  }

  async removeTag(tag: SNTag) {
    if (await confirmDialog({
      text: STRING_DELETE_TAG,
      confirmButtonStyle: 'danger'
    })) {
      this.application.deleteItem(tag);
      this.selectTag(this.getState().smartTags[0]);
    }
  }
}

export class TagsView extends WebDirective {
  constructor() {
    super();
    this.restrict = 'E';
    this.scope = {
      application: '='
    };
    this.template = template;
    this.replace = true;
    this.controller = TagsViewCtrl;
    this.controllerAs = 'self';
    this.bindToController = true;
  }
}
