import QtQuick
import Quickshell

// Render the real forms against the installed shell kit. A short viewport
// reproduces the empty-list popup; a taller one must fit the complete form.
ShellRoot {
  id: root
  property int phase: 0
  property int passed: 0
  property int failed: 0
  property int viewportHeight: 300

  function check(label, condition) {
    if (condition) passed++
    else { failed++; console.log("FAIL " + label) }
  }

  function scrollFor(item) {
    if (item.objectName === "editorFormScroll") return item
    for (var i = 0; i < item.children.length; i++) {
      var found = scrollFor(item.children[i])
      if (found) return found
    }
    return null
  }

  FloatingWindow {
    id: window
    visible: true
    implicitWidth: 440
    implicitHeight: 300
    Item {
      width: 440
      height: root.viewportHeight
      PravahEditor { id: task; anchors.fill: parent }
      PravahGoalEditor { id: goal; anchors.fill: parent }
    }
  }

  Timer {
    interval: 700
    running: true
    repeat: true
    onTriggered: {
      if (root.phase === 0) {
        task.openFor(null, "", [], "")
        goal.openFor(null)
      } else if (root.phase === 1) {
        for (var editor of [task, goal]) {
          root.check("full form preferred height", editor.implicitHeight > root.viewportHeight)
          var scroll = root.scrollFor(editor)
          root.check("short form clips and scrolls", scroll !== null && scroll.clip && scroll.contentHeight > scroll.height)
          if (scroll) scroll.contentItem.contentY = scroll.contentHeight - scroll.height
        }
        task.openFor(null, "", [], "")
        goal.openFor(null)
        for (var reopened of [task, goal]) {
          var reopenedScroll = root.scrollFor(reopened)
          root.check("reopen starts at title", reopenedScroll !== null && reopenedScroll.contentItem.contentY === 0)
        }
        root.viewportHeight = Math.max(task.implicitHeight, goal.implicitHeight) + 40
      } else if (root.phase === 2) {
        for (var expanded of [task, goal]) {
          var expandedScroll = root.scrollFor(expanded)
          root.check("full form fits expanded panel", expandedScroll !== null && expandedScroll.contentHeight <= expandedScroll.height)
        }
        task.error = "A validation message that wraps across several lines. ".repeat(8)
        goal.error = task.error
        root.viewportHeight = 300
      } else if (root.phase === 3) {
        for (var invalid of [task, goal]) {
          var invalidScroll = root.scrollFor(invalid)
          root.check("validation remains scrollable", invalidScroll !== null && invalidScroll.contentHeight > invalidScroll.height && invalid.implicitHeight >= invalidScroll.contentHeight)
        }
        console.log("PRAVAH_LAYOUT passed=" + root.passed + " failed=" + root.failed)
        Qt.quit()
      }
      root.phase++
    }
  }
}
