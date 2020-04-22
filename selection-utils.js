class SelectionUtils {
	
	/**
	* Get, as plain text (no HTML included), the currently selected text (an empty string if no text is selected).
	*/
	static getSelectedText() {
		if (!SelectionUtils.isAnythingSelected()) return "";
		return document.getSelection().toString();
	}
	
	/**
	* Get all of the tags which apply across every part of the current selection or caret position.
	* This is returned as an array of tag names. Each tag name is in uppercase.
	* This might be useful for something like a WYSIWYG editor, where you want to light up the bold button if you have some bold text selected.
	*/
	static getParentTags() {
		let result = []; // The list of tags which we will return at the end.
		if (SelectionUtils.isAnythingSelected(true)) {
			// Start with the parent of the selection (the element which contains all nodes in the selection).
			let ele = document.getSelection().getRangeAt(0).commonAncestorContainer;
			// The plan is we keep getting the node, adding it to the result, and then setting ele to be its parent. So we climb up through the tree until we reach the body. The null check is not strictly necessary, but is there as a safety net.
			while (ele != document.body && ele != null) {
				// Add the tag to the result, but only if this node is an element (and not, e.g. a text node).
				if (ele.nodeType == Node.ELEMENT_NODE) result.push(ele);
				ele = ele.parentNode;
			}
		}
		return result;
	}
	
	/**
	* Designed for use on the output of getParentTags(), e.g. like containsTag(getParentTags(), "B").
	* Checks if a list of DOM nodes contains a node of a specific tag type.
	*/
	static containsTag(list, tag) {
		tag = tag.toUpperCase();
		for (let node of list) {
			if (node.tagName.toUpperCase() == tag) return true;
		}
		return false;
	}
	
	/**
	* Create a selection programmatically, given an element where we want to make the selection, and start and end positions of the selection, relative to the element, in terms of characters from the start.
	* E.g if we wanted to select some text in this line
	*                     ===========
	*                     21        31
    * So we would call makeSelection(ourElement, 21, 31) to select "select some".
	* NOTE: calling this on a contenteditable element will also focus the element.
	* NOTE: setting both firstPos and secondPos to the same value will move the caret in a contenteditable element. See setCaretPos().
	*/
	static makeSelection(element, firstPos, secondPos) {
		if (element == null) return;
		
		// Ensure that the first position is always smaller than the second position.
		
		let tmp = firstPos;
		firstPos = Math.min(firstPos, secondPos);
		secondPos = Math.max(tmp, secondPos);
		
		// Ensure we only have positive arguments.
		
		if (firstPos < 0 || secondPos < 0) throw new Error("Both positions for the selection must be positive!");
		
		let range  = document.createRange();
		
		let start = element; // The text node which contains the start point for the selection
		let startPos = 0; // The start offset for the selection
		let end = element; // The text node which contains the end point for the selection
		let endPos = 0; // The end offset for the selection
		
		// If the first position is, say, 30, but the text is broken up into 4 9-character long segments, then we need to figure out which segment is 30 characters in. We do this by looping through all text nodes in the element, and totaling up the length of them. If the total is >= the first position, then it is in the element we just processed.
		// This happens for both the start node and the end node. We only start looking for the end node once we have found the start node.
		
		let total = 0; // The total amount of characters we have
		let findingStart = true; // Are we currently searching for the start node (true) or the end node (false)
		
		// Loop through all of the text nodes in the element
		for (let node of SelectionUtils.getAllTextNodes(element)) {
			let newTotal = total + node.textContent.length; // Calculate what the total will be after this node has been processed.
			// If we're looking for the start node, and the first position is less than the new total, this node contains our start node!
			if (findingStart && firstPos < newTotal) {
				start = node;
				startPos = firstPos - total; // Get the starting position of the selection, relative to this node
				findingStart = false;
			}
			// If we're looking for the end node, and the second position is less than the new total, this node contains our end node! NOTE: this is an if not an else if because the start position and the end position could be within the same node.
			if (!findingStart && secondPos <= newTotal) {
				end = node;
				endPos = secondPos - total; // Get the ending position of the selection, relative to this node
				break; // We can now create the selection
			}
			total = newTotal;
		}
		
		range.setStart(start, startPos);
		range.setEnd(end, endPos);
		
		let sel = document.getSelection();
		sel.removeAllRanges(); // Remove any existing selections (as there should only be one selection at a time)
		sel.addRange(range); // Add in the new selection.
	}
	
	/**
	* Deselects any text which is currently selected.
	*/
	static removeSelection() {
		if (SelectionUtils.isAnythingSelected(true)) document.getSelection().removeAllRanges();
	}
	
	/**
	* Returns true if there is some text selected, and false if there is not.
	* If caretSelection is true, then a selection comprised of just the caret will also cause this function to return true.
	*/
	static isAnythingSelected(caretSelection = false) {
		try {
			let range = document.getSelection().getRangeAt(0);
			if (caretSelection) return true;
			return range.startOffset != range.endOffset || range.startContainer != range.endContainer; // There is nothing selected if A) the selection is within the same container and B) the start offset is equal to the end offset. This is the negation of that (by DeMorgan's laws)
		}
		catch {
			return false; // If .getRangeAt(0) throws an error, then there is no range, and therefore no selection
		}
	}
	
	/**
	* Returns true if the selection is within a given element, and false if it is not.
	*/
	static isSelectionWithin(element, caretSelection = false) {
		if (element == null || !SelectionUtils.isAnythingSelected(caretSelection)) return false;
		let node = document.getSelection().getRangeAt(0).commonAncestorContainer; // Get the container for the selection
		while (true) { // Loop until either we find the element or there are no more elements
			if (element == node) return true; // We found the element!
			else if (node == document.body || node == null) return false; // There are no more elements to find
			else node = node.parentNode; //We didn't find it, but there are still elements to check, so look at this node's parent
		}
	}
	
	/**
	* Get the selection relative to the amount of characters from the beginning of an element; just like the parameters for makeSelection().
	* Returns an array like [startOffset, endOffset]. Returns an empty array if there is no selection in this element. If startOffset and endOffset are the same, then this is the caret position.
	*/
	static getSelectionPosition(element) {
		if (!SelectionUtils.isSelectionWithin(element)) return []; // Null check and selection existance check done in isSelectionWithin.
		
		let range = document.getSelection().getRangeAt(0);
		
		let startPos = 0;
		let endPos = 0;
		
		let total = 0; // The total number of characters we have looked through so far
		
		// Loop through all of the text nodes, looking for either the start node or the end node.
		for (let node of SelectionUtils.getAllTextNodes(element)) {
			if (node == range.startContainer) { // If the current node is also the start node...
				startPos = total + range.startOffset; // The start pos is the current total plus the start offset
			}
			if (node == range.endContainer) { // If the current node is also the end node (note that is is if, not else if, because the same node could contain both the start and end positions)...
				endPos = total + range.endOffset; // The end pos is the current total plus the end offset
				break;
			}
			total += node.textContent.length; // Add the amount of characters in this node to the total number of characters.
		}
		
		return [startPos, endPos];
	}
	
	/**
	* Wraps the selection with some HTML tags, or, if the selecting is already wrapped with that tag, removes the wrapping.
	* This is useful for something like a WYSIWYG editor, where could simply call toggleHTMLWrapping(ele, "STRONG") to toggle bold text, etc.
	* Optionally, attributes can also be provided, e.g. toggleHTMLWrapping(ele, "SPAN", `style="color:#f00;"`).
	* If override is true, then deletes existing tags in the selected area, but also adds in the new one.
	*/
	static toggleHTMLWrapping(element, tagName, attributes = "", override = false) {
		
		let savedSelection = SelectionUtils.getSelectionPosition(element);
		
		if (savedSelection.length == 0) return; // Error checking all done in getSelectedPosition, if there is an error it will return an array with length 0 instead of length 2
		
		tagName = tagName.toUpperCase();
		
		// Surround the selection with a dummy tag
		let range = document.getSelection().getRangeAt(0);
		let dummy = document.createElement("SELECTION-DUMMY");
		dummy.appendChild(range.extractContents()); // We need to extract the contents, rather than simply use .surroundContents(), because of cases where only part of a tag is selected, the markup wouldn't be valid otherwise.  But extractContents makes up a document fragment instead, which is much better for our purposes.
		range.insertNode(dummy);
		
		// The selection dummy will be replaced in the HTML: <SELECTION-DUMMY> will be replaced with the start variable, and
		// </SELECTION-DUMMY> will be replaced with the end variable.
		
		// We assume for now that we are going to be toggling the tag ON.
		
		let start = `<${tagName} ${attributes}>`;
		let end = `</${tagName}>`;
		
		let parentTags = SelectionUtils.getParentTags();
		let toggleOff = SelectionUtils.containsTag(parentTags, tagName); // True if we want to toggle the tag off, false if we should toggle it on.
		
		// If the selection is already surrounded by the tag to toggle, we want to remove it.
		if (toggleOff) {
			// We need to close every tag; then for the part highlighted, reopen every tag except the one to toggle off. Then, we need to close all of those tags, and finally reopen every tag which was initially open.
			// The reason for this is to prevent issues with tag sets like:
			// Hello <b>world <em>this</em> is</b> a test
			// If we wanted to turn off bold for just the "h" in "this", naively we would get:
			// Hello <b>world <em>t</b>h<b>is</em> is</b> a test
			// But, this would not work or render correctly in browsers, since you cannot close a parent within its child.
			// In fact, the outcome is inconsistant across vendors. In Chrome, the outer ending bold tag is removed, and the bold is extended until the end of the em tag, like this:
			// Hello <b>world </b><em><b>t</b>h<b>is</b></em> is a test
			// Which is clearly not right.
			// The code below closes the tags and opens the tags correctly for cases like this, resulting in HTML like
			// Hello <b>world </b><em><b>t</b>h<b>is</b></em><b> is</b> a test
			start = ``;
			end = ``;
			let endReopen = ``;
			let startReopen = ``;
			
			for (let tag of parentTags) {
				let currentTagName = tag.tagName.toUpperCase();
				
				// Only close / open tags which we are allowed to touch
				if (SelectionUtils.cleanableTags.indexOf(currentTagName) == -1) continue;
				
				// Get the full opening tag (including attributes!)
				let tagHTML = tag.outerHTML.split(">")[0] + ">";
				
				// We want to close every tag at the very start.
				start += `</${currentTagName}>`;
				// We want to reopen every tag at the very end, in reverse order to how they were closed.
				endReopen = tagHTML + endReopen;
				
				// If this is not the tag to toggle off, we also want to reopen it at the start, and reclose it at the end
				if (currentTagName != tagName) {
					startReopen = tagHTML;
					end += `</${currentTagName}>`;
				}
			}
			
			// Add the reopening for both the start and end of the selection
			start += startReopen;
			end += endReopen;
		}
		
		// Remove the selection dummy and replace it with the tags we have decided on
		element.innerHTML = element.innerHTML.replace(/<SELECTION-DUMMY>/gi, start).replace(/<\/SELECTION-DUMMY>/gi, end);
		
		// This might make a bit of a mess. So we need to clean up the HTML after.
		SelectionUtils.cleanUpHTML(element);
		
		// Put the selection / caret back where it was before this function was called.
		SelectionUtils.makeSelection(element, savedSelection[0], savedSelection[1]);
		
		// If override is on, and we toggled off an element, call this function again to toggle on the new element.
		if (toggleOff && override) SelectionUtils.toggleHTMLWrapping(element, tagName, attributes, false);
		
	}
	
	/**
	* Clears all formatting on a selected piece of text (e.g. toggles off all tags for the selection) in a given element.
	*/
	static clearFormatting(element) {
		
		let selection = SelectionUtils.getSelectionPosition(element);
		
		if (selection.length == 0) return; // Error checking all done in getSelectedPosition, if there is an error it will return an array with length 0 instead of length 2
		
		// Read through the entire element, keeping track of what tags are open / closed, and of the current text position.
		
		let counter = 0;         // Our current character in the full HTML of the element
		let tagsOpen = [];       // What tags are open at this position
		let inTag = false;       // Are we currently reading the starting / ending HTML of a tag?
		let inSelection = false; // Are we currently in the selected portion?
		
		// The new html content for this element
		let html = "";
		
		for (let char of element.innerHTML) {
			// Start of a tag
			if (char == "<") {
				inTag = true;
				//             name   full html   is closing tag?
				tagsOpen.push(["",    "<",        false         ]);
			}
			// Inside of a tag's markup
			else if (inTag) {
				let index = tagsOpen.length - 1;
				let readingName = tagsOpen[index][1].indexOf(" ") == -1; // Are we still reading the tag's name?
				// If this is the last character, we are out of the tag
				if (char == ">") {
					inTag = false;
					tagsOpen[index][1] += ">";
					// If this was a closing tag, remove its (placeholder) entry.
					if (tagsOpen[index][2]) tagsOpen.pop();
				}
				// This is a closing tag
				else if (readingName && char == "/") {
					tagsOpen[index][2] = true; // Mark as closing tag
					tagsOpen.splice(index - 1, 1); // Remove the tag underneath this one
				}
				// Otherwise, this is part of the tag's body
				else if (!tagsOpen[index][2]) {
					// If we are still reading the tag name...
					if (readingName) {
						// ...add the next character of the tag name (in upper case)
						if (char != " " && char != ">") tagsOpen[index][0] += char.toUpperCase();
					}
					// Add to the full tag HTML, too
					tagsOpen[index][1] += char;
				}
			}
			// Deal with text
			else {
				// If this is the beginning of the selection, close all of the tags
				if (counter == selection[0]) {
					inSelection = true;
					for (let i = tagsOpen.length - 1; i >= 0; i--) {
						if (SelectionUtils.cleanableTags.indexOf(tagsOpen[i][0]) == -1) continue;
						html += `</${tagsOpen[i][0]}>`;
					}
				}
				// If this is the end of the selection, re-open all of the tags
				else if (counter == selection[1]) {
					inSelection = false;
					for (let tag of tagsOpen) {
						if (SelectionUtils.cleanableTags.indexOf(tag[0]) == -1) continue;
						html += tag[1];
					}
				}
				counter++;
			}
			// Add the current character (unless it is part of a tag in the selection)
			if (!(inSelection && (inTag || char == ">"))) html += char;
		}
		
		// Apply our changes.
		element.innerHTML = html;
		
		// We might have made a bit of a mess. So we need to clean up the HTML after.
		SelectionUtils.cleanUpHTML(element);
		
		// Put the selection / caret back where it was before this function was called.
		SelectionUtils.makeSelection(element, selection[0], selection[1]);
	}
	
	/**
	* Override the selected HTML with new content, either HTML or a new DOM node.
	*/
	static insertAtSelection(element, toInsert) {
		// Ensure that the selection is within the given element.
		if (!SelectionUtils.isSelectionWithin(element, true)) return;
		
		let range = document.getSelection().getRangeAt(0);
		range.deleteContents(); // Remove the existing contents of the selection
		// If we are inserting a DOM Node
		if (toInsert instanceof HTMLElement) {
			range.insertNode(toInsert);
		}
		// Otherwise, if we are inserting a string
		else if (toInsert.constructor == String) {
			let node = document.createElement("SELECTION-DUMMY"); // Create a placeholder node to mark our place
			range.insertNode(node); // Insert that into the DOM
			node.insertAdjacentHTML("afterend", toInsert); // Insert the HTML after it
			node.remove(); // Remove the placeholder 
		}
		else {
			throw new Error("Element to insert must either be a DOM Node or a String containing HTML!");
		}
	}
	
	/**
	* Select an entire DOM node.
	*/
	static selectDOMNode(node) {
		let sel = document.getSelection();
		sel.removeAllRanges();
		let range = document.createRange();
		range.selectNode(node);
		sel.addRange(range);
	}
	
	/**
	* Removes redundant tags in an element; like those typically generated by a WYSIWYG editor. They are:
	*   *  Tag sets like <b></b>, where there is no content in-between the tags.
	*   *  Tag sets like <b>1 <b>2</b> 3</b>, where there is no need for the inner tag.
	*/
	static cleanUpHTML(element) {
		// Deal with cases like <b></b>
		let html = element.innerHTML;
		for (let tag of SelectionUtils.cleanableTags) { // Loop through all of the tags we are allowed to clean
			html = html.replace(new RegExp(`<${tag}( [^>]*)?><\/${tag}>`, "gi"), ""); // Replace all cases where there is an empty pair of these tags (with any attributes) with nothing in-between.
		}
		element.innerHTML = html;
		
		// Deal with cases like <b>1 <b>2</b> 3</b>
		for (let node of element.childNodes) {
			SelectionUtils.removeRedundantTags(node);
		}
	}
	
	/**
	* Recursively removes redundant tags like <b>1 <b>2</b> 3</b> from an element, for a result like <b>1 2 3</b>.
	*/
	static removeRedundantTags(element) {
		// Nothing to do if this is a text node or not one of the tags we're allowed to clean.
		if (element.nodeType == Node.TEXT_NODE || SelectionUtils.cleanableTags.indexOf(element.tagName.toUpperCase()) == -1) return;
		// Recursively call this method on all of this element's children
		for (let node of element.childNodes) {
			SelectionUtils.removeRedundantTags(node);
		}
		// Find every element with the same tag name inside this tag
		Array.from(element.getElementsByTagName(element.tagName)).forEach((child)=>{
			child.insertAdjacentHTML("afterend", child.innerHTML); // Duplicate all of the child's content immediantly after it.
			child.remove(); // Remove the child, meaning that its duplicated content remains but it does not.
		});
	}
	 
	/**
	* A text node is a DOM node which only contains text. Text nodes reside within HTML tag nodes.
	* This function takes any HTML node, and returns a list of all text nodes within it, even those 
	* nested multiple tags deep.
	*
	* This is used internally by other API functions. It is useful because the selection API talks in
	* terms of text nodes, but functions like getSelectedText() deal with other DOM nodes, like the
	* commonAncestorContainer. This function serves as a bridge between the two worlds.
	*/
	static getAllTextNodes(element) {
		let result = [];
		// Loop through all children of the element node we have been given.
		for (let node of element.childNodes) {
			// If the given child is a text node, add it to the result.
			if (node.nodeType == Node.TEXT_NODE) result.push(node);
			// Otherwise, recursively call this function on that node, and add all of the return values to the result.
			else result = result.concat(SelectionUtils.getAllTextNodes(node));
		}
		return result;
	}
	
	/**
	* Gets an array of 4 values [x1, y1, x2, y2], where (x1, y1) is the position of the top-left corner of the selected block (in pixels) and (x2, y2) is the position of the bottom-left corner of the selected block (in pixels).
	*/
	static getSelectionBoundingBox(element) {
		
		let savedSelection = SelectionUtils.getSelectionPosition(element);
		
		if (savedSelection.length == 0) return []; // Error checking all done in getSelectedPosition, if there is an error it will return an array with length 0 instead of length 2
		
		let currentHTML = element.innerHTML;
		let range = document.getSelection().getRangeAt(0);
		let result = [0, 0, 0, 0];
		
		// Insert a tag and get the start y position
		let startDummy = document.createElement("SELECTION-DUMMY-ONE");
		startDummy.innerHTML = "&#8203;"; // Zero-width space - without this, the first dummy will be positioned (0, 0) in the container if it is at the start of the line.
		range.insertNode(startDummy);
		result[1] = startDummy.getBoundingClientRect().top + window.scrollY;
		
		// Insert a tag and get the end y position
		range.collapse(false);
		let endDummy = document.createElement("SELECTION-DUMMY-TWO");
		range.insertNode(endDummy);
		let endRect = endDummy.getBoundingClientRect();
		result[3] = endRect.top + endRect.height + window.scrollY;
		
		// Wrap a tag around the whole selection to get the width
		startDummy.innerHTML = "";
		SelectionUtils.makeSelection(element, savedSelection[0], savedSelection[1]);
		range = document.getSelection().getRangeAt(0);
		let widthDummy = document.createElement("SELECTION-DUMMY-THREE");
		widthDummy.appendChild(range.extractContents());
		range.insertNode(widthDummy);
		let widthRect = widthDummy.getBoundingClientRect();
		result[0] = widthRect.left + window.scrollX;
		result[2] = widthRect.left + widthRect.width + window.scrollX;
		
		// Revert adding the dummy tags
		element.innerHTML = currentHTML;
		SelectionUtils.makeSelection(element, savedSelection[0], savedSelection[1]);
		
		return result;
	}
	
}

// The cleanable tags are tags which can be cleaned up by cleanUpHTML() and removeRedundantTags(); as well as cleared by clearFormatting().
SelectionUtils.cleanableTags = [];

// Define a custom event, "selected". Whenever some text is selected, this event is fired on the element containing the selection.
// The native API does have an event for selection, but it only works at the document level, not per element. We use this as the basis for our custom event.
window.addEventListener("load", ()=>{
	// When the window has finished loading, add an event handler to the selectionchange event.
	document.addEventListener("selectionchange", () => {
		if (SelectionUtils.isAnythingSelected(true)) {
			// If something is selected, fire the custom event on the commonAncestorContainer, ensuring it is set up to bubble down to say, a contenteditable div from a bold tag, etc.
			document.getSelection().getRangeAt(0).commonAncestorContainer.dispatchEvent(new CustomEvent("selected", {
				bubbles:true,
				cancelable:true
			}));
		}
	});
});