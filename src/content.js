
(function() {

if (document.contentType && !/html/i.test(document.contentType)) return;

var MIGEMO_ID = 'pocnedlaincikkkcmlpcbipcflgjnjlj';
var ACTIVATE_KEY = 191; // backslash
var HIDE_KEY = 186; // semicolon
var FIND_NEXT_KEY = 40; // down
var FIND_PREV_KEY = 38; // up
window.addEventListener('keydown', function(e) {
  var ele = document.activeElement;
  var tag = ele.tagName.toLowerCase();
  if (e.keyCode == ACTIVATE_KEY && 
    !(tag === 'textarea' || 
      (tag === 'input' && !/^(hidden|checkbox|checkbox|file|submit|image|reset|button)$/.test(ele.type)))) {
        e.preventDefault();
        show_searchbar();
  } else if (e.keyCode === HIDE_KEY) {
    e.preventDefault();
    hide_searchbar(); 
  } else if (e.keyCode === FIND_NEXT_KEY) {
    e.preventDefault();
    cycle(1);
  } else if (e.keyCode === FIND_PREV_KEY) {
    e.preventDefault();
    cycle(-1);
  }
}, false);

function show_searchbar() {
  var div = document.getElementById('migemo-find-in-page-search-bar');
  if (div) {
    var input = div.querySelector('input');
  } else {
    div = document.createElement('div');
    div.id = 'migemo-find-in-page-search-bar';
    div.className = 'migemo-find-in-page-inactive' + ' ' + document.compatMode;
    var input = document.createElement('input');
    div.appendChild(input);
    var span = document.createElement('span');
    div.appendChild(span);
    document.body.appendChild(div);
    input.addEventListener('input', function() {start_search(input.value);}, false);
  }
  setTimeout(function() {// change class in another event, otherwise no transition occurs.
    div.className = 'migemo-find-in-page-active' + ' ' + document.compatMode;
    setTimeout(function() { // focus after transition ends, otherwise unnessary scroll occurs.
      input.focus();
    }, 150);
  }, 0);
}

function hide_searchbar(e) {
  var div = document.getElementById('migemo-find-in-page-search-bar');
  if (div) {
    div.className = 'migemo-find-in-page-inactive' + ' ' + document.compatMode;
    var input = div.querySelector('input');
    input.blur();
  }
  unhighlight(true);
}

var prevquery = '';
var query = '';
var re;
var total = 0;
var pos = 0;

function start_search(q) {
  query = q;
  if (query === prevquery) return;
  prevquery = query;
  chrome.extension.sendRequest(
    MIGEMO_ID,
    {"action": "getRegExpString", "query": query},
    function(response) {
      if (!response) return; // something went wrong (bug of Migemo server)
      if (response.query !== query) return; // already typed next letter
      re = new RegExp('(' + response.result + ')', 'i');
      unhighlight();
      highlight();
      select_first_on_screen();
    }
  )
}

var XPATH = 'descendant::text()[string-length(normalize-space(self::text())) > 0 and not(ancestor::title or ancestor::textarea or ancestor::script or ancestor::style or ancestor::x:title or ancestor::x:textarea or ancestor::x:script or ancestor::x:style) and not(ancestor::*[1][contains(concat(" ",normalize-space(@class)," "), " migemo-find-in-page-found ")])]';
var NSResolver = function() {return 'http://www.w3.org/1999/xhtml'};
var expr = document.createExpression(XPATH, NSResolver);
function highlight() {
  var textNodes = expr.evaluate(document, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  var range = document.createRange();  // will be used to create DocumentFragment
  range.selectNodeContents(document.body);
  var n = 0;
  var i = 0, tn;
  console.time('highlight');
  while (tn = textNodes.snapshotItem(i++)) {
    var texts = tn.nodeValue.split(re); // eg. 'abc'.split(/(b)/) => ['a', 'b', 'c']
    if (texts.length === 1) continue; // textNode doesn't match the regexp
    var html = '', j = 0, t;
    while (t = texts[j]) {
      html += (j++ % 2 && ++n) ? '<font class="migemo-find-in-page-found">' + htmlEscape(t) + '</font>' : htmlEscape(t);
                      // increment n if regexp matches
    }
    var df = range.createContextualFragment(html);
    tn.parentNode.replaceChild(df, tn);
  }
  console.timeEnd('highlight');
  total = n;
  document.addEventListener('DOMNodeInserted', node_inserted_handler, false);
}

function unhighlight(focus) {
  // if focus == true, select the "selected" text and focus the parent node (can only focus links though)
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  var highlights = document.querySelectorAll('font.migemo-find-in-page-found');
  var selected = document.querySelector('font.migemo-find-in-page-selected');
  var i = 0, hl;
  while (hl = highlights[i++]) {
    if (hl !== selected) {
      var p = hl.parentNode;
      p.replaceChild(document.createTextNode(hl.textContent), hl);
    }
  }
  document.body.normalize();
  total = 0;
  pos = 0;

  if (selected) {
    if (focus) {
      var ps = selected.previousSibling;
      var so = ps ? (ps.nodeType === 3 ? ps.length : 0) : 0;
      var eo = so + selected.textContent.length;
      var pps = ps ? ps.previousSibling : null;
    }

    hl = selected;
    p = hl.parentNode;
    p.replaceChild(document.createTextNode(hl.textContent), hl);
    p.normalize();

    if (focus) {
      if (pps) {
        var text = pps.nextSibling;
      } else {
        var text = p.firstChild;
      }
      var range = document.createRange();
      range.setStart(text, so);
      range.setEnd(text, eo);
      window.getSelection().addRange(range);
      p.focus(); // focus if p is an anchor
    }
  }
}

function node_inserted_handler(e) {
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  setTimeout(function() {
    highlight();
  }, 10);
}

// if any matched text is on current screen, select it. otherwise, don't select anything
function select_first_on_screen() { 
  var width = window.innerWidth;
  var height = window.innerHeight;

  var highlights = document.querySelectorAll('font.migemo-find-in-page-found');
  var i = 0, hl;
  while (hl = highlights[i++]) {
    if (!is_visible(hl)) continue;
    var rect = hl.getBoundingClientRect();
    if (rect.left >= 0 && rect.left < width && rect.top >= 0 && rect.top < height) {
      hl.className += ' migemo-find-in-page-selected';
      pos = i;
      break;
    }
  }
  info(pos, total);
}

var timeout = null;
function cycle(n) {
  var highlights = document.querySelectorAll('font.migemo-find-in-page-found');
  var len = highlights.length;
  if (!len) return;
  var startpos = pos;
  var selected = document.querySelector('font.migemo-find-in-page-selected');
  var i = n > 0 ? 0 : len - 1;
  var hl;
  if (selected) {
    while (hl = highlights[i += n]) {
      if (hl === selected) break;
    }
    selected.className = 'migemo-find-in-page-found';
  }
  hl = highlights[i = (i + n + len) % len];
  hl.className += ' migemo-find-in-page-selected';
  pos = i % len || len;
  if (timeout) timeout = clearTimeout(timeout); // == undefined
  timeout = setTimeout(function() { // debouncing. leave visibility check till later
    timeout = null;
    hl.className = 'migemo-find-in-page-found'; // remove migemo-find-in-page-selected class
    while (!is_visible(hl)) {
      hl = highlights[i = (i + n + len) % len];
      pos = i % len || len;
      if (pos === startpos) {
        pos = 0;
        break;
      }
    }
    info(pos, total);
    if (pos) {
      hl.className += ' migemo-find-in-page-selected';
      into_viewport(hl);
    }
  }, 20);
}

function info(pos, total) {
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  document.querySelector('#migemo-find-in-page-search-bar > span').textContent = pos + ' of ' + total;
  document.addEventListener('DOMNodeInserted', node_inserted_handler, false);
}

function is_visible(elem) {
  var s = getComputedStyle(elem, null);
  if (s.visibility === 'hidden' || s.display === 'none') return false;
  var page = {top: 0, bottom: document.body.scrollHeight + window.innerHeight, left: 0, right: document.body.scrollWidth + window.innerWidth};
  var rect = elem.getBoundingClientRect();
  if (rect.right === rect.left || rect.top === rect.bottom) return false;
  var box = {top: rect.top + document.body.scrollTop, bottom: rect.bottom + document.body.scrollTop, left: rect.left + document.body.scrollLeft, right: rect.right + document.body.scrollLeft}
  if (box.bottom < page.top || box.top > page.bottom || box.right < page.left || box.left > page.right) return false;
  var another = document.elementFromPoint(box.left + 1, box.top + 1);
  if (!another) return true; // why sometimes null?
  if (another === elem) return true;
  var s2 = getComputedStyle(another, null);
  return s2.zIndex <= s.zIndex;
}

function into_viewport(elem) {
  var target = elem;
  while (elem = elem.parentNode) {
    var s = getComputedStyle(elem, null);
    if (s && /auto|scroll/.test(s.overflowX + s.overflowY)) {
      scroll_to_element(target, elem);
      into_viewport(elem);
      return;
    }
  }
  scroll_to_element(target, document.body);
}

function scroll_to_element(elem, origin) {
  if (origin === document.body) {
    // because some CSS such as "body {width: 100%, height: 100%}" mess up BoundingClientRect
    var outer = {left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight};
  } else {
    var outer = origin.getBoundingClientRect();
  }
  var inner = elem.getBoundingClientRect();
  var x = origin.scrollLeft;
  var y = origin.scrollTop;
  var flag = 0;
  if ((outer.left > inner.left || outer.right < inner.right) && ++flag)
    x += (inner.left + inner.right) / 2 - (outer.left + outer.right) / 2;
  if ((outer.top > inner.top || outer.bottom < inner.bottom) && ++flag)
    y += (inner.top + inner.bottom) / 2 - (outer.top + outer.bottom) / 2;

  if (flag) new Tween(origin, {
    time: 0.1,
    scrollLeft: {
      to: x
    },
    scrollTop: {
      to: y
    }
  });
}

var html_unsafe_hash = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};
function htmlEscape(text) {
  return text.replace(/[<>&"']/g,function(s) {return html_unsafe_hash[s];});
}

})()

// tween2.js : http://code.google.com/p/autopatchwork/source/browse/AutoPatchWork/tween2.js
// Tweener Like snippet
// var tw = new Tween(div.style,{time:1, onComplete:function(){},left:{to:0,from:100,tmpl:"$#px"}});
function Tween(item, opt) {
	var self = this, TIME = 10, time = (opt.time||1) * 1000, TM_EXP = /(\+)?\$([\#\d])/g, sets = [], isFilter,
		easing = opt.transition || function(t, b, c, d){return c*t/d + b;}, _T = {time:1,onComplete:1,transition:1,delay:1};
	for (var k in opt) if (!_T[k]) {
		var set = opt[k], from = set.from || parseFloat(item[k]) || 0, values = [], tmpl = set.tmpl || '$#';
		if (typeof item === 'function') {
			isFilter = true;
			sets.push({from:from, to:set.to});
		} else {
			sets.push({key:k, from:from, to:set.to, tmpl:tmpl});
		}
	}
	var L = sets.length, delay = opt.delay*1000 || 0, startTime = new Date()*1 + delay, run = function(){
		var now = new Date()*1, tim = self.prev = now - startTime;
		for (var k = 0; k < L; ++k) {
			var set = sets[k], val = easing(tim, set.from, set.to - set.from, time);
			if (isFilter) {
				item(val);
			} else {
				item[set.key] = set.tmpl.replace(TM_EXP,
				function(m, p, m1){return p && val < 0 ? 0 : (m1 == '#' ? val : val.toFixed(m1));});
			}
		}
		if (tim <= time) {self.T=setTimeout(function(){run.call(self);},TIME);}
		else {
			for (var k = 0; k < L; ++k) {
				if (isFilter) {
					item(sets[k].to);
				} else {
          item[sets[k].key] = sets[k].tmpl.replace(TM_EXP, sets[k].to);
				}
			}
			if (typeof opt.onComplete == 'function') opt.onComplete(item);
			self.end = true;
		}
	};
	self.prev = 0;
	this.restart = function(){
		startTime = new Date()*1 - self.prev;
		run();
	};
	this.pause = function(){
		if(self.T){
			clearTimeout(self.T);
			self.T = null;
		}
	};
	this.stop = function(){
		if(self.T){
			clearTimeout(self.T);
			self.T = null;
			self.prev = 0;
			for (var k = 0; k < L; ++k) {
				var set = sets[k], val = set.from;
				if (isFilter) {
					item(val);
				} else {
					item[set.key] = set.tmpl.replace(TM_EXP,
						function(m, p, m1){return p && val < 0 ? 0 : (m1 == '#' ? val : val.toFixed(m1));});
				}
			}
		}
	};
	delay ? this.T=setTimeout(function(){run();},delay) : run(0);
}
