// ==UserScript==
// @name        BlackBoard improvements
// @namespace   http://users-cs.au.dk/rav/bbdyn-dev/
// @description Adds live filtering and search form redisplay
// @include     https://bb.au.dk/*
// @version     0.6pre1
// @grant       GM_xmlhttpRequest
// @grant       GM_log
// @updateURL   https://github.com/Mortal/bbdyn/raw/stable/bbdyn.user.js
// ==/UserScript==

'use strict';

var LANG = document.documentElement.lang;
if (LANG.substring(0, 2) === 'en') {
    var TR = {
        'showAll': 'All on 1 page',
        'liveQuery': 'Filter:',
        'title': 'Find people in groups',
        'paging': 'Displaying <strong>{m}</strong> of <strong>{n}</strong>; {roles}',
        'choose_group': '(choose group)',
        'export_group_list': 'Export group list',
        'csv_username_header': 'Username',
        'csv_groups_header': 'Group',
        'csv_name_header': 'Name',
        '': ''
    };
} else {
    var TR = {
        'showAll': 'Alle på 1 side',
        'liveQuery': 'Filter:',
        'title': 'Søg brugere i grupper',
        'paging': 'Viser <strong>{m}</strong> af <strong>{n}</strong>; {roles}',
        'choose_group': '(vælg gruppe)',
        'export_group_list': 'Eksporter gruppeliste',
        'csv_username_header': 'Brugernavn',
        'csv_groups_header': 'Gruppe',
        'csv_name_header': 'Navn',
        '': ''
    };
}

function getText(o) {
    // Given a Node, return its text content.
    return o.textContent.trim();
}

function rowToUser(row) {
    // Given a <TR>, return a User object.

    var cells = [].slice.call(row.cells).map(getText),
        username = cells[1],
        first = cells[2],
        last = cells[3],
        role = cells[4],
        search_string,

        groupItemSelector = '.userGroupNamesListItem',
        groupElements = row.cells[5].querySelectorAll(groupItemSelector),
        groups = [].slice.call(groupElements).map(getText);
    groups.pop(); // "Add Group"

    username = username.replace(/\n/g, '').replace(/.*\s/, '');

    search_string = (username + ' ' + first + ' ' + last + ' '
            + groups.join(' '));

    return {
        username: username,
        first: first,
        last: last,
        role: role,
        groups: groups,
        search: search_string.toLowerCase()
    };
}

function add_json_as_textarea(node, data) {
    var textarea = document.createElement('textarea');
    textarea.style.display = 'none';
    textarea.value = JSON.stringify(data);
    node.appendChild(textarea);
    return textarea;
}

function match_word(user, word) {
    var n = parseInt(word);
    if (n === n) {
        // Is an int
        var re = new RegExp('\\b' + word + '\\b');
        return !!re.exec(user.search);
    } else {
        return user.search.indexOf(word) !== -1;
    }
}

function make_search_form(textarea, rows, users, groups) {
    var form, query, group;
    form = document.createElement('form');
    form.innerHTML = (
        '<label for="live_query"><b>' +
        TR.liveQuery + '</b></label> '
    );
    form.style.margin = '0 14px';

    query = document.createElement('input');
    query.id = 'live_query';

    group = document.createElement('select');
    function add_option(v) {
        var opt = document.createElement('option');
        opt.textContent = v;
        group.appendChild(opt);
    }
    add_option(TR.choose_group);
    for (var i = 0; i < groups.length; i += 1) {
        add_option(groups[i].replace(/ +/g, ' '));
    }

    function update() {
        if (rows.length == 0) return;

        var q = query.value.trim().toLowerCase().replace(/ +/g, ' '),
            words = q.split(' '),
            selected = [],
            selectedCount = 0,
            selectedCountRoles = {},
            i,
            j,
            match,
            hidden = document.createDocumentFragment(),
            tbody = rows[0].parentNode;

        // Show/hide rows one by one
        for (i = 0; i < rows.length; i += 1) {
            match = true;
            for (j = 0; j < words.length; j += 1) {
                if (!match_word(users[i], words[j])) {
                    match = false;
                }
            }
            var selectedGroup = null;
            if (group.selectedIndex > 0) {
                selectedGroup = groups[group.selectedIndex - 1];
            }
            if (selectedGroup !== null) {
                if (users[i].groups.indexOf(selectedGroup) === -1) {
                    match = false;
                }
            }
            rows[i].style.display = match ? '' : 'none';
            if (match) {
                selected.push(i);
                selectedCount += 1;
                selectedCountRoles[users[i].role] =
                    (selectedCountRoles[users[i].role] || 0) + 1;
            } else {
                hidden.appendChild(rows[i]);
            }
        }

        function key(i) {
            return [users[i].groups.join(' '), users[i].first, users[i].last];
        }
        selected.sort(keycmp(key));

        for (var i = 0; i < selected.length; ++i) {
            tbody.appendChild(rows[selected[i]]);
        }
        tbody.appendChild(hidden);

        // For debugging / further processing
        textarea.value = JSON.stringify(selected.map(
            function (i) { return users[i]; }));

        // Update paging text
        var selectedRoles = [];
        for (var role in selectedCountRoles) {
            selectedRoles.push(role);
        }
        selectedRoles.sort();
        for (var i = 0; i < selectedRoles.length; i += 1) {
            var role = selectedRoles[i];
            var c = selectedCountRoles[role];
            role = role.toLowerCase();
            selectedRoles[i] = c + ' ' + role;
        }

        var paging = (TR.paging
            .replace('{m}', selectedCount)
            .replace('{n}', rows.length)
            .replace('{roles}', selectedRoles.join(', ')));

        var itemcount = document.getElementById('userGroupList_itemcount');

        if (itemcount) {
            itemcount.innerHTML = paging;
        }
    }
    query.addEventListener('change', update, false);
    group.addEventListener('change', update, false);
    query.addEventListener('input', update, false);
    form.appendChild(query);
    form.appendChild(group);
    update();
    return form;
}

function redisplay_form(bbSearchForm) {
    var elements = [].slice.call(bbSearchForm.elements),
        i,
        j,
        el,
        type,
        o,
        value,
        opts;

    // Only fields with names are part of the search
    elements = elements.filter(function (el) {
        return !!el.name;
    });

    if (bbSearchForm.match) {
        bbSearchForm.match.selectedIndex = 0;
    }
    for (i = 0; i < elements.length; i += 1) {
        // The search form has three kinds of fields: select, text and checkbox.
        el = elements[i];

        // The type of a field is either its <input> type or its tag name.
        type = (el.tagName === 'INPUT') ? el.type : el.tagName;

        // Search the query string for the field value
        o = new RegExp(el.name + '=([^&;]*)', 'i').exec(location.search);

        // Unchecked checkboxes are not part of the HTTP submission
        value = o ? o[1] : null;

        if (type === 'checkbox') {
            el.checked = !!value;

        } else if (type === 'SELECT') {
            opts = [].slice.call(el.options);
            for (j = 0; j < opts.length; j += 1) {
                if (opts[j].value === value) {
                    el.selectedIndex = j;
                    break;
                }
            }

        } else {
            // Probably a text field.
            el.value = value || '';
        }
    }
}

function add_show_all(bbSearchForm) {
    // Add a form field to show all since this is not normally part of the form.
    // bbSearchForm is <form id=bbSearchForm>

    // All form fields are contained in a single <li>
    var container = bbSearchForm.querySelector('li'),
        chk,
        label;

    // Add checkbox
    chk = document.createElement('input');
    chk.name = 'showAll';
    chk.type = 'checkbox';
    chk.value = 'true';
    chk.id = 'id_showAll';
    container.appendChild(chk);

    // Add label
    label = document.createElement('label');
    label.setAttribute('for', chk.id);
    label.textContent = TR.showAll;
    container.appendChild(label);
}

function keycmp(key) {
    return function cmp(g1, g2) {
        var k1 = key(g1), k2 = key(g2);
        return (k1 < k2) ? -1 : (k1 > k2) ? 1 : 0;
    }
}

function extract_groups(users) {
    var groups = [], i, j, gr;
    for (i = 0; i < users.length; i += 1) {
        for (j = 0; j < users[i].groups.length; j += 1) {
            gr = users[i].groups[j];
            if (groups.indexOf(gr) === -1) {
                groups.push(gr);
            }
        }
    }
    function key(group) {
        var is_class = group.indexOf('Hold') !== -1;
        return [is_class ? 0 : 1, group];
    }
    groups.sort(keycmp(key));
    return groups;
}

function csv_username(user) {
    return user.username;
}
csv_username.header = TR.csv_username_header;
function csv_groups(user) {
    return user.groups.join(' ');
}
csv_groups.header = TR.csv_groups_header;
function csv_name(user) {
    return user.first + ' ' + user.last;
}
csv_name.header = TR.csv_name_header;

function add_export_group_list(form, users) {
    function get_column_header(column) {
        return column.header;
    }
    function get_column_value(user) {
        function f(column) {
            return column(user);
        }
        return f;
    }

    var s = [];
    var columns = [csv_username, csv_name, csv_groups];
    s.push(columns.map(get_column_header).join('\t'));
    for (var i = 0; i < users.length; ++i) {
        var special_roles = [
            'Instructor', 'Teaching Assistant',
            'Underviser', 'Undervisningsassistent'
        ];
        if (special_roles.indexOf(users[i].role) !== -1) {
            // Skip these roles, as the grade center doesn't want them
            continue;
        }
        if (users[i].groups.length == 0) {
            // Hide users in no groups
            continue;
        }

        s.push(columns.map(get_column_value(users[i])).join('\t'));
    }
    var url = 'data:text/plain;base64,' + btoa(s.join('\n'));

    var link = document.createElement('a');
    link.setAttribute('download', 'groups.csv');
    link.setAttribute('href', url);
    link.style.display = 'inline-block';
    link.style.margin = '0px 14px';
    link.innerHTML = TR.export_group_list;

    form.appendChild(link);
}

function parseUserGroupList() {
    var targetPage = '/webapps/bb-group-mgmt-LEARN/execute/groupInventoryList';
    if (location.pathname !== targetPage) {
        return;
    }
    if (location.search.indexOf('toggleType=users') === -1) {
        return;
    }
    if (location.search.indexOf('liveFilterOnly') === -1) {
        return;
    }

    var userGroupList = document.getElementById('userGroupList');
    if (!userGroupList) {
        console.log("Could not find #userGroupList");
        return;
    }

    var tbody = document.getElementById('userGroupList_databody');
    var rows = tbody ? [].slice.call(tbody.rows) : [];
    var users = rows.map(rowToUser);
    var textarea = add_json_as_textarea(userGroupList, users);

    var groups = extract_groups(users);

    var bbSearchForm = document.getElementsByName('searchForm')[0];
    add_show_all(bbSearchForm);
    redisplay_form(bbSearchForm);

    var ourSearchForm = make_search_form(textarea, rows, users, groups);
    add_export_group_list(ourSearchForm, users);
    bbSearchForm.parentNode.insertBefore(ourSearchForm, bbSearchForm);

    var header = document.getElementById('pageTitleText');
    header.textContent = TR.title;
    window.top.document.title = document.title = header.textContent;

    bbSearchForm.style.display = 'none';
}

function get_course_id() {
    return /course_id=([_0-9]+)/.exec(location.search)[1];
}

function get_edit_mode() {
    var modeSwitch = document.getElementById('editModeToggleLink');
    return modeSwitch.classList.contains('read-on');
}

function switch_to_edit_mode(href) {
    function onload(response) {
        GM_log([
            response.status,
            response.statusText,
            response.readyState,
            response.responseHeaders,
            response.responseText,
            response.finalUrl
        ].join("\n"));

        location.href = href;
    }

    var url = ('/webapps/blackboard/execute/doCourseMenuAction' +
        '?cmd=setDesignerParticipantViewMode' +
        '&courseId=' + get_course_id() +
        '&mode=designer');

    GM_xmlhttpRequest({
        method: 'GET',  // should be POST?
        url: url,
        onload: onload
    });
}

function load_a_in_edit_mode(event) {
    if (get_edit_mode()) {
        // Permit default
    } else {
        event.preventDefault();
        event.stopPropagation();
        switch_to_edit_mode(event.target.href);
    }
}

function amendMenu() {
    var existingMenuItem = document.querySelector(
        "[id='controlpanel.users.and.groups']"
    );
    if (existingMenuItem) {
        var ul = existingMenuItem.parentNode;
        var h4 = document.createElement('h4');
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.style.background = 'none';

        var courseId = get_course_id();
        a.href = ('/webapps/bb-group-mgmt-LEARN/execute/groupInventoryList' +
                  '?course_id=' + courseId +
                  '&chkAllRoles=all&showAll=true&toggleType=users' +
                  '&liveFilterOnly=jatak');
        a.target = 'content';
        a.textContent = TR.title;
        a.addEventListener('click', load_a_in_edit_mode, false);
        h4.appendChild(a);
        li.appendChild(h4);
        ul.insertBefore(li, existingMenuItem.nextSibling);
    }
}

parseUserGroupList();

amendMenu();

window.top.document.title = document.title;

// vim: set ts=4 sw=4 sts=4 et:
