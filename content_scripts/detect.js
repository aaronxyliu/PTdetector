(() => {
    /**
     * Check and set a global guard variable.
     * If this content script is injected into the same page again,
     * it will do nothing next time.
     */
    if (window.DetectorHasRun) {
        return;
    }
    window.DetectorHasRun = true;

    function getAttr(v) {
        if (v == undefined || v == null) {
            return [];
        }
        if (typeof (v) == 'object' || typeof (v) == 'function') {
            let vlist = Object.getOwnPropertyNames(v);
            vlist = vlist.filter(val => !["prototype"].includes(val));
            return vlist
        }    
        return [];
    }

    function hasCircle(v_path) {
        // Prevent loop in the object tree
        // Check whether v points to some parent variable
        if (v_path.length < 1) 
            return false

        cur_v = 'window'
        for (let v of v_path) {
            cur_v += `["${v}"]`
        }
        try{
            if (eval(`typeof (${cur_v}) != 'object' && typeof (${cur_v}) != 'function'`)) 
                return false
        }
        catch{
            return false
        }
        ancient_v = 'window'
        if (eval(`${ancient_v} == ${cur_v}`))
            return true
        for (let i = 0; i < v_path.length - 1; i += 1) {
            ancient_v += `["${v_path[i]}"]`
            try {
                if (eval(`typeof (${ancient_v}) == 'object' || typeof (${ancient_v}) == 'function'`))
                    if (eval(`${ancient_v} == ${cur_v}`))
                        return true
            }
            catch {
                continue
            }
        }
        return false
    }

    function findKeywords(pts, blacklist, depth_limit=3) {
        let keyword_list = []
        let q = []
        q.push([])
        while (q.length) {
            let v_path = q.shift()

            if (hasCircle(v_path))
                continue

            let v_str = 'window'
            for (let v of v_path) {
                v_str += `["${v}"]`
            }
            let children;
            try{
                children = eval(`getAttr(${v_str})`);

            }
            catch(err){
                children = [];
            }

            // Remove global variables in blacklist
            if (v_path.length == 0)
                children = children.filter(val => !blacklist.includes(val));

            if (v_path.length < depth_limit) {
                for (let child_v of children) {
                    if (pts.hasOwnProperty(child_v)) {
                        keyword_list.push([v_str, child_v])
                    }
                    q.push([...v_path])
                    q[q.length - 1].push(child_v)
                }
            }    
        }
        return keyword_list
    }

    function isArraySetMap(v) {
        if (Array.isArray(v))   return true;
        if (Object.getPrototypeOf(v) === Set.prototype)   return true;
        if (Object.getPrototypeOf(v) === Map.prototype)   return true;
        return false;
    }

    
    function compare_Dict_V (_dict, v) {
        if (!_dict) return false;
        if (v == undefined) {
            if (_dict['t'] == 1) return true;
            else return false;
        }
        if (v == null) {
            if (_dict['t'] == 2) return true;
            else return false;
        }
        if (isArraySetMap(v)) {
            if (_dict['t'] == 3 && _dict['v'] == v.length) return true;
            else return false;
        }
        if (typeof (v) == 'string') {
            if (_dict['t'] == 4 && _dict['v'] == v.slice(0, 10).replace(/<|>/g, '_')) return true;
            else return false;
        }
        if (typeof (v) == 'object') {
            if (_dict['t'] == 5) return true;
            else return false;
        }
        if (typeof (v) == 'function') {
            if (_dict['t'] == 6) return true;
            else return false;        
        }
        if (typeof (v) == 'number') {
            if (_dict['t'] == 7 && _dict['v'] == v.toFixed(2)) return true;
            else return false;
        }
        // Other condition
        if (_dict['t'] == typeof (v)) return true;
        else return false;
    }
    
    function matchPTree(pt, base) {
        // BFS
        let match_record = {}
        let q = []      // Property Path Queue
        let qc = []     // pTree Queue
        q.push([])
        qc.push(pt)

        while (qc.length) {
            let v_path = q.shift()
            let cur_node = qc.shift()

            let v_str = base
            for (let v of v_path) {
                v_str += `["${v}"]`
            }

            // match_record:
            //  { file_id: {
            //      'credit1': credit1 score
            //      'matched': matched node number
            //   } }

            for (let _dict of cur_node['d']) {
                if (eval(`compare_Dict_V (_dict['d'], ${v_str})`)) {
                    for (let lib_info of _dict['Ls']) {
                        let file_id = lib_info['F']
                        let credit1 = lib_info['x']
                        if (match_record.hasOwnProperty(file_id)) {
                            match_record[file_id]['credit1'] += credit1
                            match_record[file_id]['matched'] += 1
                        }
                        else {
                            match_record[file_id] = {'credit1': credit1, 'matched': 1, 'base': base}
                        }
                        // if (file_id == 1) {
                        //     console.log(v_str)
                        // }
                    }
                }
            }

            let v_prop = eval(`getAttr(${v_str})`)

            for (let child of cur_node['c']) {
                if (v_prop.includes(child['n'])) {
                    
                    q.push([...v_path])              // shallow copy
                    q[q.length - 1].push(child['n'])
                    qc.push(child)
                }
            }             

        }
        return match_record
    }

    function classifyLib(match_records, file_list) {
        let lib_match_list = {}

        // lib_match_list: {
        //     lib_name: {
        //         file_name: { 
        //              base: [ {
        //                  'credit1': credit1 score
        //                  'matched': matched node number
        //                  'root': root node name
        //              } ... ]
        //         }
        //     }
        // }

        for (let match_record_pair of match_records) {
            let match_record = match_record_pair[0]
            for (let file_id in match_record) {
                // let file_tag = file_list[file_id]
                // let at_index = file_tag.indexOf('@')
                // let lib_name = file_tag.slice(0, at_index)
                let file_obj = file_list[file_id]
                let lib_name = file_obj['libname']
                let file_name = `${file_obj['filename']} (${file_obj['version']})`
                let base = match_record_pair[1]

                let unit_info = match_record[file_id]
                unit_info['root'] = match_record_pair[2]

                if (!lib_match_list.hasOwnProperty(lib_name)) {
                    lib_match_list[lib_name] = {}
                }
                if (!lib_match_list[lib_name].hasOwnProperty(file_name)) {
                    lib_match_list[lib_name][file_name] = {}
                }
                if (!lib_match_list[lib_name][file_name].hasOwnProperty(base)) {
                    lib_match_list[lib_name][file_name][base] = []
                }
                lib_match_list[lib_name][file_name][base].push(unit_info)
            }
        }
        return lib_match_list
    }

    function calScore(lib_match_list) {
        let new_lib = []
        for (let lib_name in lib_match_list) {
            let files = lib_match_list[lib_name]
            let new_file = []
            for (let file_name in files) {
                let bases = files[file_name]
                let new_base = []
                for (let base in bases) {
                    let unit_list = bases[base]
                    credit1_sum = 0
                    matched_sum = 0
                    matched_keys = []
                    for (let unit of unit_list) {
                        credit1_sum += unit['credit1']
                        matched_sum += unit['matched']
                        matched_keys.push(unit['root'])
                    }
                    new_base.push({'base name': base, 'credit1': credit1_sum, 'matched': matched_sum, 'keys': matched_keys})
                }
                new_file.push({'file name': file_name, 'bases': new_base})
            }
            new_lib.push({'lib name': lib_name, 'files': new_file})
            
        }
        return new_lib
    }

    function sortScore(score_list) {
        for (let lib_info of score_list) {
            for (let file_info of lib_info['files']) {
                file_info['bases'].sort((a, b) => b['credit1']-a['credit1'])
            }
            lib_info['files'].sort((a, b) => b['bases'][0]['credit1']-a['bases'][0]['credit1'])
            lib_info['score'] = lib_info['files'][0]['bases'][0]['credit1']
            let base_name = lib_info['files'][0]['bases'][0]['base name']
            lib_info['base depth'] = 1
            for (let char of base_name) {
                if (char == '[') {
                    lib_info['base depth'] += 1
                }
            }
        }
        score_list.sort((a, b) => b['score']-a['score'])
    }

    function filterList(lib_match_list) {
        let newlist = []
        for (let lib_info of lib_match_list) {
            if (lib_info['files'][0]['bases'][0]['matched'] > 1)
                newlist.push(lib_info)
        }
        return newlist
    }

    function ResultToString(score_list) {
        let result_str = '['
        let lib_num = 0
        for (let lib_info of score_list) {
            if (lib_info["score"] < 50)
                continue
            result_str += `"${lib_info["lib name"]}:${lib_info["score"].toFixed(2)}!${lib_info["base depth"]}",`
            lib_num += 1
        }
        if (lib_num > 0)
            result_str = result_str.slice(0, result_str.length-1)
        result_str += ']'
        return result_str
    }

    /**
     * Listen for messages from the content script.
     */
    window.addEventListener("message", function (event) {
        if (event.data.type == 'detect') {
            let requests = event.data.urls.map((url) => {
                return fetch(url).then((response) => {
                    return response.json()})
            });
            Promise.all(requests)
                .then((results) => {
                    let blacklist = results[0]
                    let pts = results[1]
                    let file_list = results[2]

                    // Used to calculate spending time
                    let start_time = Date.now()

                    // Find all keywords in the web object tree
                    let keyword_list = findKeywords(pts, blacklist, 3)
                    // console.log(keyword_list);

                    // Calculate the credit for each library
                    let match_records = []
                    for (let keyword of keyword_list) {
                        let v_base = keyword[0]
                        let v_name = keyword[1]

                        let pt = pts[v_name]
                        let match_record = matchPTree(pt, `${v_base}["${v_name}"]`)
                        match_records.push([match_record, v_base, v_name])
                    }

                    // Classify match_record based on lib name
                    lib_match_list = classifyLib(match_records, file_list)
                    score_list = calScore(lib_match_list)

                    let end_time = Date.now()

                    // Sort the result based on credit score
                    sortScore(score_list)
                    console.log('All detected lib:')
                    console.log(score_list)

                    console.log('Filtered (#matched > 1):')
                    score_list = filterList(score_list)
                    console.log(score_list)

                    window.postMessage({type: 'response', detected_libs: score_list}, "*")

                    // Only used for Selenium automation
                    var detectTimeMeta = document.getElementById('lib-detect-time')
                    detectTimeMeta.setAttribute("content", end_time - start_time);

                    var detectResultMeta = document.getElementById('lib-detect-result')
                    detectResultMeta.setAttribute("content", ResultToString(score_list));

                })

        }


    });
})();
