// view/item_tree.js: Item tree view and related utilities for TabFern
// Copyright (c) 2017 Chris White, Jasmine Hegman.

(function (root, factory) {     // Boilerplate {{{1
    if (typeof define === 'function' && define.amd) {
        // AMD
        define([ 'jquery','jstree','jstree-actions', 'jstree-flagnode',
                    'jstree-because', 'loglevel', 'view/const',
                    'jstree-multitype', 'jstree-redraw-event' ], factory);
    } else if (typeof exports === 'object') {
        // Node, CommonJS-like
        module.exports = factory(
            require('jquery'), require('jstree'), require('jstree-actions'),
            require('jstree-flagnode'), require('jstree-because'),
            require('loglevel'), require('view/const'),
            require('jstree-multitype'), require('jstree-redraw-event')
        );
    } else {
        // Browser globals (root is `window`)
        root.T = factory(
            root.$, root.$.jstree, root.jstree.plugins.actions,
            root.jstree.plugins.flagnode, root.jstree.plugins.because,
            root.log, root.K,
            root.jstree.plugins.multitype, root.jstree.plugins.redraw_event
        );
    }
}(this, function ($, _jstree, _actions, _flagnode, _because, log_orig, K, _multitype, _redraw_event ) {
    "use strict";

    function loginfo(...args) { log_orig.info('TabFern view/item_tree.js: ', ...args); };
// }}}1

    /// The module we are creating
    let me = {
        treeobj: null,      ///< The jstree instance
    };

    // --- General --- {{{1

    /// Easy access to the tree root
    me.root_node = () => { return T.treeobj.get_node($.jstree.root); }

    // }}}1
    // --- Scrolling support --- {{{1

    /// The most recently seen right edge
    me.last_r_edge = undefined;

    /// Inner function to set #jq's css('right') to line up with #r_edge,
    /// given the same assumptions as rjustify_action_group_at() below.
    /// For speed, assumes jq.length > 0.
    function rjustify_inner(jq, r_edge, scroll_left) {
        scroll_left = (+scroll_left || 0) |0;
        // Get the position with right:0 in force.  This is the native
        // position, to which specifications of right: are negative.
        // TODO? memoize this?
        jq.css('right',0);
        let orig_left = jq.offset().left;

        // Move the box to where it should be.
        jq.css( 'right', 0 - (r_edge - jq.outerWidth() - orig_left + scroll_left) );
            // right: has to be negative to move the box to the right.
    } //rjustify_inner

    /// Set the css('right') to line up with last_r_edge for the
    /// action group under #node_dom_elem, given the same assumptions
    /// as rjustify_action_group_at() below.
    /// Takes an optional \p idx_unused_opt so it can be called from $().each().
    /// If me.do_not_rjustify is truthy, does nothing.
    me.rjustify_node_actions = function(idx_unused_opt, node_dom_elem) {
        if(me.do_not_rjustify) return;
        if(arguments.length === 1) node_dom_elem = idx_unused_opt;
        let jq;
        // TODO? use treeobj.get_node instead?

        // If we were called directly from an after_open handler, we
        // have event data in node_dom_elem.  Unpack it.
        if(node_dom_elem && typeof node_dom_elem === 'object' &&
                    node_dom_elem.node && node_dom_elem.node.id) {
            node_dom_elem = node_dom_elem.node.id;
        }

        if(typeof node_dom_elem === 'string') {
            node_dom_elem = '#' + node_dom_elem;
        }

        jq = $('> div > .' + K.ACTION_GROUP_WIN_CLASS, node_dom_elem);

        if(jq.length) {     // Do this node
            let sl = $(window).scrollLeft();
                // TODO? use fixed 0 if horizontal scrollbar is disabled?
            rjustify_inner(jq, me.last_r_edge, sl);
        }

        // Do this node's children, if any.  They appear not to always be
        // included in the list of nodes provided to the redraw.jstree event
        //
        // TODO pass scrollLeft down into this function so it doesn't have
        // to be called over and over.
        $('li.jstree-node',node_dom_elem).each(me.rjustify_node_actions);
    } //rjustify_node_actions

    /// Set each action group's css('right') to line up with the right
    /// edge at #rt, assuming position:relative with right: specified,
    /// and with left: not specified.  ** NOTE ** assumes LTR.
    /// TODO support RTL.
    me.rjustify_action_group_at = function(r_edge) {

        // When called from an open or close action, r_edge will actually
        // be an event, and we will have a second argument holding
        // {node, instance}.  Use the saved edge, if we have one.
        if(typeof r_edge !== 'number') r_edge = me.last_r_edge;
        if(typeof r_edge !== 'number') return;

        me.last_r_edge = r_edge;

        // TODO if it's an after_open or after_close, only process nodes
        // from that node to the bottom of the tree.
        $('.' + K.ACTION_GROUP_WIN_CLASS).each(function(idx, dom_elem) {
            let sl = $(window).scrollLeft();
            rjustify_inner($(dom_elem), r_edge, sl);
        });
    } //rjustify_action_group_at

    // Resize detection modified from
    // https://stackoverflow.com/a/22571956/2877364 by
    // https://stackoverflow.com/users/95733/commonpike , based on
    // https://stackoverflow.com/a/20888342/2877364 and
    // https://gist.github.com/OrganicPanda/8222636 by
    // https://stackoverflow.com/users/178959/organicpanda
    //
    // This is nice because it will also trigger when the V scrollbar
    // appears or disappears.

    me.install_resize_detector = function(win, jq_tree){
        let jq_iframe = $('<iframe id="scrollbar-listener"/>');
        jq_iframe.css({
            'position'      : 'fixed',
            'width'         : '100%',
            'height'        : 0,
            'bottom'        : 0,
            'border'        : 0,
            'background-color'  : 'transparent'
        }).on('load',function() {
            var timer   = null;
            var iframe = this;

            // Trigger once on startup so the action groups can be positioned
            // properly
            $(win).trigger('inner_resize',[iframe.clientWidth]);

            // Trigger whenever the size of the iframe changes
            this.contentWindow.addEventListener('resize', function() {
                clearTimeout(timer);
                timer = setTimeout(function() {
                    $(win).trigger('inner_resize',[iframe.clientWidth]);
                }, 50);
            });

        }).appendTo('body');

        // Set up for hscroll detection, if necessary
        if(!getBoolSetting(CFG_HIDE_HORIZONTAL_SCROLLBARS)) {
            let timer = null;
            let last_scrollLeft = null;
            $(win).scroll(function() {
                clearTimeout(timer);
                timer = setTimeout(()=>{
                    let sl = $(this).scrollLeft();  //lexical `this`
                    if(sl !== last_scrollLeft) {
                        last_scrollLeft = sl;
                        me.rjustify_action_group_at();
                    }
                },50);
            });
        }

        //Do we need the following?

        // We also need this on redraw.jstree, but I am going to add that
        // later, in tree.js, after we've loaded the tree initially.
        // jq_tree.on('redraw.jstree', me.rjustify_action_group_at);
        jq_tree.on('after_open.jstree', me.rjustify_node_actions);

        //jq_tree.on('after_close.jstree', me.rjustify_action_group_at);
    }; //install_resize_detector

    /// Install an event handler that calls rjustify_node_actions.
    /// If me.do_not_rjustify is truthy, do nothing.
    /// @param jq_tree  {Object}    A JQuery object for the element holding the
    ///                             tree, or null to use me.treeobj.element
    /// @param event_name {String}  Which event to catch
    /// @param once {mixed} If truthy, catch only once.
    me.install_rjustify = function(jq_tree, event_name, once) {
        if(me.do_not_rjustify) return;

        jq_tree = jq_tree || me.treeobj.element;
        jq_tree[once?'one':'on'](event_name, function(evt, evt_data){
            //log.info({[event_name]]:arguments});
            if(evt_data && typeof evt_data === 'object' && evt_data.obj) {
                me.rjustify_node_actions(evt_data.obj);
                    // Has to run in this tick, as far as I can tell.
            }
        });
    }; //install_rjustify

    /* Comments on install_rjustify:
     *
     * I used to call rjustify_node_actions on each redraw_event.jstree, i.e.,
     * each call to redraw_node().  However, that caused layout during the
     * jstree _redraw attendant on a dnd, which in turn gave rise to #102.
     * Therefore, I now use install_rjustify selectively to trigger only when
     * necessary.  As far as I can tell, for example, dnd does not trigger
     * set_text, so I can safely hook that globally below.
     *
     * redraw_node may be called by:
     *  - jstree-actions:add_action()
     *  - jstree-actions:remove_action()
     *  - model:refresh_tooltip()
     *  - tree:actionCloseWindowButDoNotSave()
     *  - tree:connectChromeWindowToTreeWindowItem()
     *  - jstree:_redraw() (internal)
     *  - jstree:draw_children() (internal)
     *  - jstree:set_text()
     *  - jstree:create_node()
     *  - jstree:delete_node()
     */


    // }}}1
    // --- Tree creation --- {{{1

    // CSS classes
    const WIN_CLASS = 'tf-window'; // class on all <li>s representing windows
    const TAB_CLASS = 'tf-tab';    // class on all <li>s representing tabs
    const OPEN_CLASS = 'tfs-open';
    const SAVED_CLASS = 'tfs-saved';
    const RECOVERED_CLASS = 'tfs-recovered';
    const TOP_BORDER_CLASS = 'tfs-top-bordered';

    /// Create the tree.
    /// @param selector {JQuery selector} where to make the tree
    /// @param check_callback {function}
    /// @param is_draggable {function}
    /// @param contextmenu_items {function} If truthy, show a context menu
    me.create = function(selector, check_callback, is_draggable,
                                contextmenu_items)
    {
        // Node types - use constants as the keys
        let jstreeTypes = {};

        jstreeTypes[K.IT_WIN] = {
            li_attr: { 'class': WIN_CLASS },
            //a_attr: { 'title': 'Unsaved window' },    //maybe?
            //icon: 'clear-icon',  // We will overlay the actual icon in the CSS
        };

        jstreeTypes[K.NST_OPEN] = { li_attr: { 'class': OPEN_CLASS } };
        jstreeTypes[K.NST_SAVED] = { li_attr: { 'class': SAVED_CLASS } };
        jstreeTypes[K.NST_RECOVERED] = { li_attr: { 'class': RECOVERED_CLASS } };
        jstreeTypes[K.NST_TOP_BORDER] = { li_attr: { 'class': TOP_BORDER_CLASS } };

        jstreeTypes[K.IT_TAB] = {
            li_attr: { 'class': TAB_CLASS },
            icon: 'fff-page',   // per-node icons will override this
        };

        // TODO add option for users to create divider items between windows -
        // e.g., <div style="display:inline-block; width: 100%; height:0px; margin-top:8px; margin-bottom:7px; border-top: 1px solid yellow;"></div>

        // The main config
        let jstreeConfig = {
            plugins: ['because', 'wholerow', 'actions',
                        // actions must be after wholerow since we attach the
                        // action buttons to the wholerow div
                        'dnd', 'multitype', 'flagnode',
                        // flagnode must be after multitype - TODO update flagnode
                     ], // TODO add state plugin
            core: {
                animation: false,
                multiple: false,          // for now
                //check_callback added below if provided
                themes: {
                    name: getThemeName(),
                    variant: 'small',
                },
            },
            state: {
                key: 'tabfern-jstree'
            },
            flagnode: {
                css_class: 'tf-focused'
            },
            dnd: {
                copy: false,
                drag_selection: false,  // only drag one node
                //is_draggable added below if provided
                large_drop_target: true
                //, use_html5: true     // Didn't work in my testing
                //, check_while_dragging: false   // For debugging only
            },
            multitype: jstreeTypes,
            actions: {
                propagation: 'stop'
                    // clicks on action buttons don't also go to any other elements
            },
        };

        // Note on dnd.use_html5: When it's set, if you drag a non-draggable item,
        // it seems to treat the drag as if you were dragging the last node
        // you successfully dragged.
        // The effect of this is that, e.g., after dragging a window, dragging
        // one of its children moves the whole window.  TODO report this upstream.

        if(check_callback) jstreeConfig.core.check_callback = check_callback;
        if(is_draggable) jstreeConfig.dnd.is_draggable = is_draggable;

        if(contextmenu_items) {
            jstreeConfig.plugins.push('contextmenu');
            jstreeConfig.contextmenu = {
                items: contextmenu_items
            };
            $.jstree.defaults.contextmenu.select_node = false;
            $.jstree.defaults.contextmenu.show_at_node = false;
        }

        // This is always the last plugin
        jstreeConfig.plugins.push('redraw_event');

        // Create the tree
        let jq_tree = $(selector);
        me.treeobj = jq_tree.jstree(jstreeConfig).jstree(true);

        // wholerow hides the dots on ready.jstree and set_state.jstree.
        // Show them again.
        if(getBoolSetting(CFG_SHOW_TREE_LINES)) {
            jq_tree.on('ready.jstree set_state.jstree', ()=>{
                me.treeobj.show_dots();
            });
            me.treeobj.show_dots();     // in case of a race with
        }                                   // those events.

        // Add custom event handlers
        //me.install_vscroll_function(window, jq_tree);
        me.install_resize_detector(window, jq_tree);
        me.install_rjustify(jq_tree, 'set_text.jstree');

        // Add a spare node that will be hidden and that will serve as a
        // holding pen when tabs are being attached and detached.
        me.holding_node_id = me.treeobj.create_node(
                $.jstree.root,
                {   id: 'ord',
                    text: '** Holding pen',
                    state:  { hidden: true },
                    data: { skip: true },
                        // Skip this window while processing, unless you're
                        // expressly looking for it.  Skipped nodes should
                        // be kept at the top, just for regularity.
                });

        // TODO move this to a constructor so you can create multiple,
        // separate treeobjs.
        // TODO? make treeobj the prototype of me?  Then, e.g., T.get_node
        // would work, and you wouldn't have to say T.treeobj.get_node.
        // Or maybe make vscroll a jstree plugin?

    }; //me.create()
    // }}}1

    return me;
}));

// vi: set ts=4 sts=4 sw=4 et ai fo-=o fo-=r fdm=marker: //
