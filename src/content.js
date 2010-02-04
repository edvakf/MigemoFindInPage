
(function() {

if (document.contentType && !/html/i.test(document.contentType)) return;

var MIGEMO_ID = 'pocnedlaincikkkcmlpcbipcflgjnjlj';
var PREFIX = 'migemo-find-in-page-';
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
  var div = document.getElementById(PREFIX + 'box');
  if (div) {
    var input = div.getElementsByTagName('input')[0];
  } else {
    div = document.createElement('div');
    div.id = PREFIX + 'box';
    div.className = PREFIX + 'inactive' + ' ' + PREFIX + document.compatMode;
    var input = document.createElement('input');
    div.appendChild(input);
    var span = document.createElement('span');
    div.appendChild(span);
    document.body.appendChild(div);
    input.addEventListener('input', function() {start_search(input.value);}, false);
  }
  setTimeout(function() {// change class in another event, otherwise no transition occurs.
    div.className = PREFIX + 'active' + ' ' + PREFIX + document.compatMode;
    setTimeout(function() { // focus after transition ends, otherwise unnessary scroll occurs.
      input.focus();
      input.select();
      highlight();
      select_first_on_screen();
    }, 150);
  }, 0);
}

function hide_searchbar(e) {
  var div = document.getElementById(PREFIX + 'box');
  if (div) {
    div.className = PREFIX + 'inactive' + ' ' + PREFIX + document.compatMode;
    var input = div.getElementsByTagName('input')[0];
    input.blur();
  }
  unhighlight(true);
}

var prevquery = '';
var query = '';
var re;
var total = 0;
var pos = 0;

function start_search(q, retry) {
  query = q;
  retry = retry || 0;
  if (retry > 2 && query === prevquery) return;
  prevquery = query;

  var timer = setTimeout(function() {// retry case 1. no response
    if (query === q) start_search(query, retry + 1);
  }, 300);

  chrome.extension.sendRequest(
    MIGEMO_ID,
    {"action": "getRegExpString", "query": query},
    function(response) {
      clearTimeout(timer);
      if (response.query !== query) return; // already typed next letter
      if (response.query && !response.result) return start_search(query, retry + 1); // retry case 2. something went wrong on the server
      re = new RegExp('(' + response.result + ')', 'i');
      unhighlight();
      highlight();
      select_first_on_screen();
    }
  )
}

var XPATH = '/html/body/descendant::text()[string-length(normalize-space(self::text())) > 0 and not(ancestor::textarea or ancestor::script or ancestor::style or ancestor::x:textarea or ancestor::x:script or ancestor::x:style) and not(ancestor::*[1][contains(concat(" ",normalize-space(@class)," "), " ' + PREFIX + 'found ")])]';
var NSResolver = function() {return 'http://www.w3.org/1999/xhtml'};
var expr = document.createExpression(XPATH, NSResolver);
function highlight() {
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  var textNodes = expr.evaluate(document, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
  var range = document.createRange();  // will be used to create DocumentFragment
  range.selectNodeContents(document.body);
  var i = 0, tn, len;
  while (tn = textNodes.snapshotItem(i++)) {
    var texts = tn.nodeValue.split(re); // eg. 'abc'.split(/(b)/) => ['a', 'b', 'c']
    if ((len = texts.length) === 1) continue; // textNode doesn't match the regexp
    var html = '';
    for (var j = 0; j < len; ++j) {
      var t = htmlEscape(texts[j]);
      html += (j % 2) ? '<font class="' + PREFIX + 'found">' + t + '</font>' : t;
    }
    var df = range.createContextualFragment(html);
    tn.parentNode.replaceChild(df, tn);
  }
  total = document.querySelectorAll('font.' + PREFIX + 'found').length;
  document.addEventListener('DOMNodeInserted', node_inserted_handler, false);
}

function unhighlight(focus) {
  // if focus == true, select the "selected" text and focus the parent node (can only focus links though)
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  var selected = document.getElementById(PREFIX + 'selected');
  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
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
  // DOMNodeInserted occurs synchronously, so if some process inserts a lot of nodes, this captures all of them and get's very slow.
  // so remove event listener once and deal with them later all at once
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false); 
  setTimeout(function() {
    highlight();
  }, 10);
}

// if any matched text is on current screen, select it. otherwise, don't select anything
function select_first_on_screen() { 
  var selected = document.getElementById(PREFIX + 'selected');
  if (selected) {
    if (is_viewable(selected)) return;
    selected.id = '';
  }

  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
  var i = 0, hl;
  while (hl = highlights[i++]) {
    if (is_viewable(hl)) {
      hl.id = PREFIX + 'selected';
      pos = i;
      break;
    }
  }
  info(pos, total);
}

function is_viewable(elem) {
  var rects = elem.getClientRects();
  var r, i = 0;
  while (r = rects[i++]) {
    switch (elem) {
      // elementFromPoint takes coordinates on viewport (same coord as BoundingClientRect)
      case document.elementFromPoint(r.left, r.top): return true;
      case document.elementFromPoint(r.right, r.top): return true;
      case document.elementFromPoint(r.left, r.bottom): return true;
      case document.elementFromPoint(r.right, r.bottom): return true;
    }
  }
  return false;
}

function info(pos, total) {
  document.removeEventListener('DOMNodeInserted', node_inserted_handler, false);
  document.querySelector('#' + PREFIX + 'box > span').textContent = pos + ' of ' + total;
  document.addEventListener('DOMNodeInserted', node_inserted_handler, false);
}

var timer;
function cycle(n) {
  var highlights = document.querySelectorAll('font.' + PREFIX + 'found');
  var len = highlights.length;
  if (!len) return;
  var selected = document.getElementById(PREFIX + 'selected');
  var i = n > 0 ? 0 : len - 1;
  var hl;
  if (selected) {
    while (hl = highlights[i += n]) {
      if (hl === selected) break;
    }
    selected.id = '';
  }
  hl = highlights[i = (i + n + len) % len];
  hl.id = PREFIX + 'selected';
  pos = i % len || len;

  var starti = i;
  timer = clearTimeout(timer);
  timer = setTimeout(function() {
    var mover = new Mover;
    try {
      while (true) {
        mover.test_move(hl); // synchronously move
        if (is_viewable(hl)) {
          hl.id = PREFIX + 'selected';
          pos = i % len || len;
          mover.start(hl);
          break;
        }

        hl.id = '';
        hl = highlights[i = (i + n + len) % len];
        if (i === starti) {
          pos = 0;
          break;
        }
      }
    } catch(e) {
      console.log(e);
    } finally {
      mover.release();
    }

    info(pos, total);
  }, 20);
}

function Mover() {
  this.elements = []; // collection of tainted elements
  this.viewport = {left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight};
}

Mover.prototype.test_move = function(elem) {
  if (elem === document.body) return;
  var target = elem;
  this.elements.push(target);
  if (elem = target.mfip_container) {
    this.scroll_to(target, elem);
    this.test_move(elem);
    return;
  }
  elem = target;
  while (elem = elem.parentNode) {
    this.elements.push(elem);
    var s = elem.mfip_style || (elem.mfip_style = getComputedStyle(elem, null));
    if (elem === document.body || /auto|scroll/.test(s.overflowX + s.overflowY)) {
      target.mfip_container = elem;
      this.scroll_to(target, elem);
      this.test_move(elem);
      return;
    }
  }
}

Mover.prototype.scroll_to = function(target, origin, async) {
  var inner = target.getBoundingClientRect();
  if (!origin.mfip_original_scroll) origin.mfip_original_scroll = {top: origin.scrollTop, left: origin.scrollLeft};

  if (origin === document.body) {
    var outer = this.viewport;
  } else {
    var outer = origin.getBoundingClientRect();
  }
  var dx = (inner.left + inner.right) / 2 - (outer.left + outer.right) / 2;
  var dy = (inner.top + inner.bottom) / 2 - (outer.top + outer.bottom) / 2;
  if (!async) {
    origin.scrollLeft += dx;
    origin.scrollTop += dy;
  } else {
    if (outer.left <= inner.left && outer.right >= inner.right) {
      dx = 0;
    }
    if (outer.top <= inner.top && outer.bottom >= inner.bottom) {
      dy = 0;
    }
    if (dx || dy) new Tween(origin, {
      time: 0.1,
      scrollLeft: {
        to: origin.scrollLeft + dx
      },
      scrollTop: {
        to: origin.scrollTop + dy
      }
    });
  }
}

Mover.prototype.start = function(elem) {
  var target;
  while ((target = elem) && (elem = elem.mfip_container)) {
    elem.scrollLeft = elem.mfip_original_scroll.left;
    elem.scrollTop = elem.mfip_original_scroll.top;
    this.scroll_to(target, elem, true);
  }
}

Mover.prototype.release = function() {
  var elems = this.elements, i = -1, e;
  while (e = elems[++i]) {
    delete e.mfip_container;
    delete e.mfip_style;
    delete e.mfip_original_scroll;
  }
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
