import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Disposable } from 'event-kit'

import { NewImageDiff } from './new-image-diff'
import { ModifiedImageDiff } from './modified-image-diff'
import { DeletedImageDiff } from './deleted-image-diff'
import { BinaryFile } from './binary-file'

import { Editor } from 'codemirror'
import { CodeMirrorHost } from './code-mirror-host'
import { Repository } from '../../models/repository'

import { FileChange, WorkingDirectoryFileChange, FileStatus } from '../../models/status'
import { DiffSelection, DiffType, IDiff, IImageDiff, ITextDiff } from '../../models/diff'
import { Dispatcher } from '../../lib/dispatcher/dispatcher'

import { diffLineForIndex, diffHunkForIndex, findInteractiveDiffRange } from './diff-explorer'
import { DiffLineGutter } from './diff-line-gutter'
import { IEditorConfigurationExtra } from './editor-configuration-extra'
import { getDiffMode } from './diff-mode'
import { ISelectionStrategy } from './selection/selection-strategy'
import { DragDropSelection } from './selection/drag-drop-selection-strategy'
import { RangeSelection } from './selection/range-selection-strategy'

import { fatalError } from '../../lib/fatal-error'

import { RangeSelectionSizePixels } from './edge-detection'

if (__DARWIN__) {
  // This has to be required to support the `simple` scrollbar style.
  require('codemirror/addon/scroll/simplescrollbars')
}

/** The props for the Diff component. */
interface IDiffProps {
  readonly repository: Repository

  /**
   * Whether the diff is readonly, e.g., displaying a historical diff, or the
   * diff's lines can be selected, e.g., displaying a change in the working
   * directory.
   */
  readonly readOnly: boolean

  /** The file whose diff should be displayed. */
  readonly file: FileChange

  /** Called when the includedness of lines or a range of lines has changed. */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /** The diff that should be rendered */
  readonly diff: IDiff

  /** propagate errors up to the main application */
  readonly dispatcher: Dispatcher
}

/** A component which renders a diff for a file. */
export class Diff extends React.Component<IDiffProps, void> {
  private codeMirror: Editor | null
  private gutterWidth: number | null

  /**
   * We store the scroll position before reloading the same diff so that we can
   * restore it when we're done. If we're not reloading the same diff, this'll
   * be null.
   */
  private scrollPositionToRestore: { left: number, top: number } | null = null

  /**
   * A mapping from CodeMirror line handles to disposables which, when disposed
   * cleans up any line gutter components and events associated with that line.
   * See renderLine for more information.
   */
  private readonly lineCleanup = new Map<any, Disposable>()

  /**
   * Maintain the current state of the user interacting with the diff gutter
   */
  private selection: ISelectionStrategy | null = null

  /**
   *  a local cache of gutter elements, keyed by the row in the diff
   */
  private cachedGutterElements = new Map<number, DiffLineGutter>()

  public componentWillReceiveProps(nextProps: IDiffProps) {
    // If we're reloading the same file, we want to save the current scroll
    // position and restore it after the diff's been updated.
    const sameFile = nextProps.file && this.props.file && nextProps.file.id === this.props.file.id

    // Happy path, if the text hasn't changed we won't re-render
    // and subsequently won't have to restore the scroll position.
    const textHasChanged = nextProps.diff !== this.props.diff

    const codeMirror = this.codeMirror
    if (codeMirror && sameFile && textHasChanged) {
      const scrollInfo = codeMirror.getScrollInfo()
      this.scrollPositionToRestore = { left: scrollInfo.left, top: scrollInfo.top }
    } else {
      this.scrollPositionToRestore = null
    }

    // HACK: This entire section is a hack. Whenever we receive
    // props we update all currently visible gutter elements with
    // the selection state from the file.
    if (nextProps.file instanceof WorkingDirectoryFileChange) {
      const selection = nextProps.file.selection
      const oldSelection = this.props.file instanceof WorkingDirectoryFileChange
        ? this.props.file.selection
        : null

      // Nothing has changed
      if (oldSelection === selection) { return }

      this.gutterWidth = null

      const diff = nextProps.diff
      this.cachedGutterElements.forEach((element, index) => {
        if (!element) {
          console.error('expected DOM element for diff gutter not found')
          return
        }

        if (diff.kind === DiffType.Text) {
          const line = diffLineForIndex(diff, index)
          const isIncludable = line ? line.isIncludeableLine() : false
          const isSelected = selection.isSelected(index) && isIncludable
          element.setSelected(isSelected)
        }
      })
    }
  }

  public componentWillUnmount() {
    this.dispose()
  }

  private dispose() {
    this.codeMirror = null

    this.lineCleanup.forEach(disposable => disposable.dispose())
    this.lineCleanup.clear()

    document.removeEventListener('mouseup', this.onDocumentMouseUp)
  }

  /**
   * compute the diff gutter width based on what's been rendered in the browser
   */
  private getAndCacheGutterWidth = (): number | null => {

    if (this.gutterWidth) {
      return this.gutterWidth
    }

    if (this.codeMirror) {
      // as getWidth will return 0 for elements that are offscreen, this code
      // will look for the first row of the current viewport, which should be
      // onscreen
      const viewport = this.codeMirror.getScrollInfo()
      const top = viewport.top
      const cm = this.codeMirror as any

      const row = cm.lineAtHeight(top, 'local')
      const element = this.cachedGutterElements.get(row)

      if (!element) {
        console.error(`unable to find element at ${row}, should probably look into that`)
        return null
      }

      this.gutterWidth = element.getWidth()

      if (this.gutterWidth === 0) {
        console.error(`element at row ${row} does not have a width, should probably look into that`)
      }
    }

    return this.gutterWidth
  }

  private updateRangeHoverState = (start: number, end: number, show: boolean) => {
    for (let i = start; i <= end; i++) {
      this.hoverLine(i, show)
    }
  }

  private hoverLine = (row: number, include: boolean) => {
    const element = this.cachedGutterElements.get(row)

    // element may not be drawn by the editor, so updating it isn't necessary
    if (element) {
      element.setHover(include)
    }
  }

  /**
   * start a selection gesture based on the current interation
   */
  private startSelection = (file: WorkingDirectoryFileChange, diff: ITextDiff, index: number, isRangeSelection: boolean) => {
    const snapshot = file.selection
    const selected = snapshot.isSelected(index)
    const desiredSelection = !selected

    if (isRangeSelection) {
      const range = findInteractiveDiffRange(diff, index)
      if (!range) {
        console.error('unable to find range for given line in diff')
        return
      }

      this.selection = new RangeSelection(range.start, range.end, desiredSelection, snapshot)
    } else {
      this.selection = new DragDropSelection(index, desiredSelection, snapshot)
    }

    this.selection.paint(this.cachedGutterElements)
    document.addEventListener('mouseup', this.onDocumentMouseUp)
  }

  /**
   * Helper event listener, registered when starting a selection by
   * clicking anywhere on or near the gutter. Immediately removes itself
   * from the mouseup event on the document element and ends any current
   * selection.
   *
   * TODO: Once Electron upgrades to Chrome 55 we can drop this in favor
   * of the 'once' option in addEventListener, see
   * https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
   */
  private onDocumentMouseUp = (ev: MouseEvent) => {
    ev.preventDefault()
    document.removeEventListener('mouseup', this.onDocumentMouseUp)
    this.endSelection()
  }

  /**
   * complete the selection gesture and apply the change to the diff
   */
  private endSelection = () => {

    if (!this.props.onIncludeChanged || !this.selection) {
      return
    }

    this.props.onIncludeChanged(this.selection.done())

    // operation is completed, clean this up
    this.selection = null
  }

  private onGutterMouseDown = (index: number, diff: ITextDiff, isRangeSelection: boolean) => {
    if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
      fatalError('must not start selection when selected file is not a WorkingDirectoryFileChange')
      return
    }

    if (isRangeSelection) {
      const hunk = diffHunkForIndex(diff, index)
      if (!hunk) {
        console.error('unable to find hunk for given line in diff')
      }
    }
    this.startSelection(this.props.file, diff, index, isRangeSelection)
  }

  private onGutterMouseMove = (index: number) => {
    if (!this.selection) {
      return
    }

    this.selection.update(index)
    this.selection.paint(this.cachedGutterElements)
  }

  private onDiffTextMouseMove = (ev: MouseEvent, diff: ITextDiff, index: number) => {
    const isActive = this.isMouseCursorNearGutter(ev)
    if (isActive === null) {
      return
    }

    const diffLine = diffLineForIndex(diff, index)
    if (!diffLine) {
      return
    }

    if (!diffLine.isIncludeableLine()) {
      return
    }

    const range = findInteractiveDiffRange(diff, index)
    if (!range) {
      console.error('unable to find range for given index in diff')
      return
    }

    this.updateRangeHoverState(range.start, range.end, isActive)
  }

  private onDiffTextMouseDown = (ev: MouseEvent, diff: ITextDiff, index: number) => {
    const isActive = this.isMouseCursorNearGutter(ev)

    if (isActive) {
      // this line is important because it prevents the codemirror editor
      // from handling the event and resetting the scroll position.
      // it doesn't do this when you click on elements in the gutter,
      // which is an amazing joke to have placed upon me right now
      ev.preventDefault()

      if (!(this.props.file instanceof WorkingDirectoryFileChange)) {
        fatalError('must not start selection when selected file is not a WorkingDirectoryFileChange')
        return
      }

      this.startSelection(this.props.file, diff, index, true)
    }
  }

  private onDiffTextMouseLeave = (ev: MouseEvent, diff: ITextDiff, index: number) => {
    const range = findInteractiveDiffRange(diff, index)
    if (!range) {
      console.error('unable to find range for given index in diff')
      return
    }

    this.updateRangeHoverState(range.start, range.end, false)
  }

  private isMouseCursorNearGutter = (ev: MouseEvent): boolean | null =>  {
    const width = this.getAndCacheGutterWidth()

    if (!width) {
      // should fail earlier than this with a helpful error message
      return null
    }

    const deltaX = ev.layerX - width
    return deltaX >= 0 && deltaX <= RangeSelectionSizePixels
  }

  private renderLine = (instance: any, line: any, element: HTMLElement) => {
    const existingLineDisposable = this.lineCleanup.get(line)

    // If we can find the line in our cleanup list that means the line is
    // being re-rendered. Agains, CodeMirror doesn't fire the 'delete' event
    // when this happens.
    if (existingLineDisposable) {
      existingLineDisposable.dispose()
      this.lineCleanup.delete(line)
    }

    const diff = this.props.diff
    if (diff.kind !== DiffType.Text) {
      return
    }

    const index = instance.getLineNumber(line) as number

    const diffLine = diffLineForIndex(diff, index)
    if (diffLine) {
      const diffLineElement = element.children[0] as HTMLSpanElement

      const reactContainer = document.createElement('span')

      let isIncluded = false
      if (this.props.file instanceof WorkingDirectoryFileChange) {
        isIncluded = this.props.file.selection.isSelected(index)
      }

      const cache = this.cachedGutterElements

      ReactDOM.render(
        <DiffLineGutter
          line={diffLine}
          isIncluded={isIncluded}
          index={index}
          readOnly={this.props.readOnly}
          diff={diff}
          updateRangeHoverState={this.updateRangeHoverState}
          isSelectionEnabled={this.isSelectionEnabled}
          onMouseDown={this.onGutterMouseDown}
          onMouseMove={this.onGutterMouseMove} />,
        reactContainer,
        function (this: DiffLineGutter) {
          if (this !== undefined) {
            cache.set(index, this)
          }
        }
      )

      const onMouseMoveLine: (ev: MouseEvent) => void = (ev) => {
        this.onDiffTextMouseMove(ev, diff, index)
      }

      const onMouseDownLine: (ev: MouseEvent) => void = (ev) => {
        this.onDiffTextMouseDown(ev, diff, index)
      }

      const onMouseLeaveLine: (ev: MouseEvent) => void = (ev) => {
        this.onDiffTextMouseLeave(ev, diff, index)
      }

      if (!this.props.readOnly) {
        diffLineElement.addEventListener('mousemove', onMouseMoveLine)
        diffLineElement.addEventListener('mousedown', onMouseDownLine)
        diffLineElement.addEventListener('mouseleave', onMouseLeaveLine)
      }

      element.insertBefore(reactContainer, diffLineElement)

      // Hack(ish?). In order to be a real good citizen we need to unsubscribe from
      // the line delete event once we've been called once or the component has been
      // unmounted. In the latter case it's _probably_ not strictly necessary since
      // the only thing gc rooted by the event should be isolated and eligble for
      // collection. But let's be extra cautious I guess.
      //
      // The only way to unsubscribe is to pass the exact same function given to the
      // 'on' function to the 'off' so we need a reference to ourselves, basically.
      let deleteHandler: () => void

      // Since we manually render a react component we have to take care of unmounting
      // it or else we'll leak memory. This disposable will unmount the component.
      //
      // See https://facebook.github.io/react/blog/2015/10/01/react-render-and-top-level-api.html
      const gutterCleanup = new Disposable(() => {
        this.cachedGutterElements.delete(index)

        ReactDOM.unmountComponentAtNode(reactContainer)

        if (!this.props.readOnly) {
          diffLineElement.removeEventListener('mousemove', onMouseMoveLine)
          diffLineElement.removeEventListener('mousedown', onMouseDownLine)
          diffLineElement.removeEventListener('mouseleave', onMouseLeaveLine)
        }

        line.off('delete', deleteHandler)
      })

      // Add the cleanup disposable to our list of disposables so that we clean up when
      // this component is unmounted or when the line is re-rendered. When either of that
      // happens the line 'delete' event doesn't  fire.
      this.lineCleanup.set(line, gutterCleanup)

      // If the line delete event fires we dispose of the disposable (disposing is
      // idempotent)
      deleteHandler = () => {
        const disp = this.lineCleanup.get(line)
        if (disp) {
          this.lineCleanup.delete(line)
          disp.dispose()
        }
      }
      line.on('delete', deleteHandler)
    }
  }

  private isSelectionEnabled = () => {
    return this.selection == null
  }

  private restoreScrollPosition(cm: Editor) {
    const scrollPosition = this.scrollPositionToRestore
    if (cm && scrollPosition) {
      cm.scrollTo(scrollPosition.left, scrollPosition.top)
    }
  }

  private onChanges = (cm: Editor) => {
    this.restoreScrollPosition(cm)
  }

  private renderImage(imageDiff: IImageDiff) {
    if (imageDiff.current && imageDiff.previous) {
      return <ModifiedImageDiff
                current={imageDiff.current}
                previous={imageDiff.previous} />
    }

    if (imageDiff.current && this.props.file.status === FileStatus.New) {
      return <NewImageDiff current={imageDiff.current} />
    }

    if (imageDiff.previous && this.props.file.status === FileStatus.Deleted) {
      return <DeletedImageDiff previous={imageDiff.previous} />
    }

    return null
  }

  private renderBinaryFile() {
    return <BinaryFile path={this.props.file.path}
      repository={this.props.repository}
      dispatcher={this.props.dispatcher} />
  }

  private renderTextDiff(diff: ITextDiff) {
      const options: IEditorConfigurationExtra = {
        lineNumbers: false,
        readOnly: true,
        showCursorWhenSelecting: false,
        cursorBlinkRate: -1,
        lineWrapping: localStorage.getItem('soft-wrap-is-best-wrap') ? true : false,
        // Make sure CodeMirror doesn't capture Tab and thus destroy tab navigation
        extraKeys: { Tab: false },
        scrollbarStyle: __DARWIN__ ? 'simple' : 'native',
        mode: getDiffMode(),
        styleSelectedText: true,
      }

      return (
        <CodeMirrorHost
          className='diff-code-mirror'
          value={diff.text}
          options={options}
          isSelectionEnabled={this.isSelectionEnabled}
          onChanges={this.onChanges}
          onRenderLine={this.renderLine}
          ref={this.getAndStoreCodeMirrorInstance}
        />
      )
  }

  private getAndStoreCodeMirrorInstance = (cmh: CodeMirrorHost) => {
    this.codeMirror = cmh === null ? null : cmh.getEditor()
  }

  public render() {
    const diff = this.props.diff

    if (diff.kind === DiffType.Image) {
      return this.renderImage(diff)
    }

    if (diff.kind === DiffType.Binary) {
      return this.renderBinaryFile()
    }

    if (diff.kind === DiffType.Text) {
      return this.renderTextDiff(diff)
    }

    return null
  }
}
